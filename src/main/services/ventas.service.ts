import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { errors } from '@shared/errors'
import { writeAudit } from '../repositories/auditoria.repo'
import { getEmpresa, nextSerieNumber, nextSerieDetalle } from '../repositories/configuracion.repo'
import * as repo from '../repositories/ventas.repo'
import * as aux from '../repositories/auxiliares.repo'
import { calcularLinea, resumenLineas } from '../core/impuestos'
import { redondearCantidad } from '../core/dinero'
import type {
  DocumentoVentaInput, DocumentosFiltroInput, AnularDocumentoInput,
  ConvertirDocumentoInput, ImprimirDocumentoInput, PagoInput,
  CotizacionCarritoInput, ConduceInput, EntregaInput
} from '@shared/schemas/ventas'

type InventarioService = ReturnType<typeof import('./inventario.service').createInventarioService>
type Modulo = 'ventas' | 'pos' | 'cotizaciones'

const DOCUMENTOS_CON_STOCK = new Set([
  'FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS', 'DEVOLUCION_VENTA', 'NOTA_CREDITO'
])
const DOCUMENTOS_CON_COBRO = new Set(['FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS'])

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function permisoCrear(modulo: Modulo, tipo: string): string {
  if (modulo === 'pos') return 'pos.crear'
  if (modulo === 'cotizaciones') return 'cotizaciones.crear'
  return ['NOTA_CREDITO', 'DEVOLUCION_VENTA'].includes(tipo) ? 'ventas.devolucion' : 'ventas.crear'
}

const esCotizacion = (tipo: unknown): boolean => ['COTIZACION', 'PEDIDO'].includes(String(tipo))

/** Fase 6 — Ventas. Un documento y todos sus efectos se escriben en una transacción. */
export function createVentasService(db: Db, inventario: InventarioService) {
  function audit(ctx: SessionContext, operacion: string, entidad: string, id: number, antes: unknown, despues: unknown): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  function tiene(ctx: SessionContext, permiso: string): boolean {
    return ctx.permisos.includes(permiso)
  }

  function almacenPorDefecto(ctx: SessionContext, id?: number): number {
    if (id) {
      const row = db.prepare('SELECT id FROM almacenes WHERE id = ? AND empresa_id = ? AND activo = 1').get(id, ctx.empresaId) as { id: number } | undefined
      if (!row) throw errors.notFound('Almacén')
      return row.id
    }
    const row = db.prepare('SELECT id FROM almacenes WHERE empresa_id = ? AND activo = 1 ORDER BY id LIMIT 1').get(ctx.empresaId) as { id: number } | undefined
    if (!row) throw errors.notFound('Almacén')
    return row.id
  }

  /** La validación ocurre antes de reservar: un rechazo nunca consume un correlativo. */
  function numerar(empresaId: number, tipo: string, fecha: string): { numero: string; esNcf: boolean } {
    const reserva = nextSerieDetalle(db, empresaId, tipo, fecha)
    return { numero: reserva.numero, esNcf: reserva.esNcf }
  }

  function validarSerieYLote(empresaId: number, producto: repo.Fila, linea: { numeroSerie?: string; lote?: string; cantidad: number }, almacenId: number): void {
    if (producto.manejaSerie) {
      if (!linea.numeroSerie) throw errors.validation(`El producto ${producto.descripcion} requiere número de serie.`)
      const existe = db.prepare(`
        SELECT id FROM series_producto
        WHERE empresa_id = ? AND producto_id = ? AND serie = ? AND estado = 'DISPONIBLE'
      `).get(empresaId, producto.id, linea.numeroSerie)
      if (!existe) throw errors.conflict(`La serie ${linea.numeroSerie} no está disponible.`)
    }
    if (producto.manejaLote) {
      if (!linea.lote) throw errors.validation(`El producto ${producto.descripcion} requiere lote.`)
      const lote = db.prepare(`
        SELECT vencimiento, cantidad FROM lotes_producto
        WHERE empresa_id = ? AND producto_id = ? AND lote = ?
      `).get(empresaId, producto.id, linea.lote) as { vencimiento: string; cantidad: number } | undefined
      if (!lote) throw errors.conflict(`El lote ${linea.lote} no existe.`)
      if (lote.vencimiento && lote.vencimiento < hoy()) throw errors.conflict(`El lote ${linea.lote} está vencido.`)
      if (Number(lote.cantidad) + 1e-9 < linea.cantidad) throw errors.conflict(`Cantidad insuficiente en el lote ${linea.lote}.`)
    }
    void almacenId
  }

  function consumirSerieYLote(empresaId: number, producto: repo.Fila, linea: { numeroSerie?: string; lote?: string; cantidad: number }, docId: number, docTipo: string, almacenId: number, signo: number): void {
    if (producto.manejaSerie && linea.numeroSerie) {
      db.prepare(`
        UPDATE series_producto SET estado = ?, doc_tipo = ?, doc_id = ?
        WHERE empresa_id = ? AND producto_id = ? AND serie = ?
      `).run(signo > 0 ? 'VENDIDO' : 'DISPONIBLE', signo > 0 ? docTipo : '', signo > 0 ? docId : null,
        empresaId, producto.id, linea.numeroSerie)
    }
    if (producto.manejaLote && linea.lote) {
      db.prepare(`
        UPDATE lotes_producto SET cantidad = MAX(0, cantidad - ?)
        WHERE empresa_id = ? AND producto_id = ? AND lote = ?
      `).run(redondearCantidad(linea.cantidad) * signo, empresaId, producto.id, linea.lote)
    }
    void almacenId
  }

  function registrarPagos(
    ctx: SessionContext, docId: number, tipo: string, totalCent: number,
    pagos: PagoInput[] | undefined, sesionCajaId: number | null
  ): void {
    if (!DOCUMENTOS_CON_COBRO.has(tipo)) return
    // El crédito se documenta en CxC; los abonos son Fase 8, nunca un cobro automático.
    if (tipo === 'FACTURA_CREDITO' && !pagos?.length) return
    const lista = pagos?.length
      ? pagos
      : [{ metodo: 'EFECTIVO' as const, montoCent: totalCent, referencia: '' }]
    const suma = lista.reduce((s, p) => s + p.montoCent, 0)
    if (suma !== totalCent) {
      throw errors.conflict(`Los pagos suman ${suma} centavos y el documento totaliza ${totalCent} centavos.`)
    }
    const caja = sesionCajaId
      ? db.prepare('SELECT caja_id FROM caja_sesiones WHERE id = ? AND empresa_id = ?').get(sesionCajaId, ctx.empresaId) as { caja_id: number } | undefined
      : undefined
    for (const pago of lista) {
      let movimientoId: number | null = null
      if (pago.metodo === 'EFECTIVO' && sesionCajaId && caja) {
        movimientoId = aux.movimientoCaja(db, {
          empresaId: ctx.empresaId, cajaSesionId: sesionCajaId, cajaId: caja.caja_id,
          tipo: 'INGRESO', metodo: pago.metodo, montoCent: pago.montoCent,
          docTipo: tipo, docId, descripcion: `Cobro ${tipo}`, usuarioId: ctx.userId
        })
      }
      repo.insertarPago(db, ctx.empresaId, docId, {
        ...pago, referencia: pago.referencia ?? '',
        cajaSesionId: sesionCajaId, cajaMovimientoId: movimientoId, usuarioId: ctx.userId
      })
    }
  }

  function registrarCxC(ctx: SessionContext, docId: number, numero: string, cliente: repo.Fila, totalCent: number, fecha: string, vencimiento: string): void {
    if (cliente.limiteCreditoCent && Number(cliente.balanceCent) + totalCent > Number(cliente.limiteCreditoCent)) {
      throw errors.conflict('El cliente superaría su límite de crédito con esta factura.')
    }
    const cxcId = aux.crearCxc(db, {
      empresaId: ctx.empresaId, clienteId: Number(cliente.id), docVentaId: docId,
      numeroDocumento: numero, fecha, vencimiento, montoCent: totalCent
    })
    aux.movimientoCxc(db, {
      empresaId: ctx.empresaId, clienteId: Number(cliente.id), cxcDocumentoId: cxcId,
      docVentaId: docId, tipo: 'CARGO', montoCent: totalCent,
      referencia: numero, usuarioId: ctx.userId
    })
    aux.ajustarBalanceCliente(db, ctx.empresaId, Number(cliente.id), totalCent)
  }

  interface OpcionesCrear {
    modulo?: Modulo
    sesionCajaId?: number | null
  }

  /** Crea cualquier documento de venta; es el único punto de alta de Fase 6. */
  function crearDocumento(
    ctx: SessionContext, input: DocumentoVentaInput, opciones: OpcionesCrear = {}
  ): { id: number; numero: string; totalCent: number; esNcf: boolean } {
    const modulo = opciones.modulo ?? 'ventas'
    requirePermission(ctx, permisoCrear(modulo, input.tipo))
    const permisoDescuento = `${modulo}.descuento`
    const permisoPrecio = `${modulo}.precio`
    const motivo = input.motivo ?? ''
    const comentarios = input.comentarios ?? ''

    const cliente = repo.getCliente(db, ctx.empresaId, input.clienteId)
    if (!cliente) throw errors.notFound('Cliente')
    if (['DEVOLUCION_VENTA', 'NOTA_CREDITO'].includes(input.tipo) && !input.docOrigenId) {
      throw errors.validation('Las devoluciones y notas de crédito requieren un documento de origen.')
    }
    const almacenId = almacenPorDefecto(ctx, input.almacenId)
    const fecha = input.fecha ?? hoy()
    const condicion = input.tipo === 'FACTURA_CREDITO' ? 'CREDITO' : 'CONTADO'
    const estado = input.tipo === 'COTIZACION' || input.tipo === 'PEDIDO' ? 'PENDIENTE' : 'ACTIVO'
    const vencimiento = input.tipo === 'FACTURA_CREDITO'
      ? (input.vencimiento ?? sumarDias(fecha, Number(cliente.condicionPagoDias ?? 0)))
      : (input.vencimiento ?? '')
    const origen = input.docOrigenId ? repo.getDocumento(db, ctx.empresaId, input.docOrigenId) : undefined
    if (input.docOrigenId && !origen) throw errors.notFound('Documento de origen')
    if (origen && ['ANULADO', 'CONVERTIDA'].includes(String(origen.estado))) {
      throw errors.conflict('El documento de origen ya no puede convertirse.')
    }

    return db.transaction(() => {
      const { numero, esNcf } = numerar(ctx.empresaId, input.tipo, fecha)
      const docId = repo.insertarDocumento(db, {
        empresaId: ctx.empresaId, tipo: input.tipo, numero, esNcf,
        clienteId: Number(cliente.id), clienteNombre: String(cliente.nombre),
        clienteRnc: String(cliente.rncCedula ?? ''), fecha, vencimiento,
        vendedorId: input.vendedorId ?? (cliente.vendedorId ? Number(cliente.vendedorId) : null),
        almacenId, condicion, estado, usuarioId: ctx.userId,
        docOrigenId: input.docOrigenId ?? null,
        motivo, comentarios
      })

      const calculadas: ReturnType<typeof calcularLinea>[] = []
      let costoTotalCent = 0
      for (const linea of input.lineas) {
        // Los defaults de Zod se aplican en el router; aquí se repiten porque
        // otros servicios y las pruebas pueden invocar este método directamente.
        const descuentoPctBp = linea.descuentoPctBp ?? 0
        const numeroSerie = linea.numeroSerie ?? ''
        const lote = linea.lote ?? ''
        const producto = repo.getProducto(db, ctx.empresaId, linea.productoId)
        if (!producto) throw errors.notFound('Producto')
        const precio = linea.precioCent ?? Number(producto.precio1Cent ?? 0)
        if (linea.precioCent !== undefined && linea.precioCent !== Number(producto.precio1Cent ?? 0)) {
          requirePermission(ctx, permisoPrecio)
        }
        const minimo = Number(producto.precioMinimoCent ?? 0)
        if (minimo > 0 && precio < minimo && !tiene(ctx, permisoPrecio)) {
          throw errors.conflict(`El precio de ${producto.descripcion} está por debajo del mínimo permitido.`)
        }
        if ((descuentoPctBp > 0 || linea.descuentoCent !== undefined) && !tiene(ctx, permisoDescuento)) {
          throw errors.forbidden()
        }
        const impuesto = repo.getImpuesto(db, ctx.empresaId, linea.impuestoId ?? (producto.impuestoId ? Number(producto.impuestoId) : undefined))
        const exento = Boolean(linea.exento) || Boolean(impuesto?.exento)
        const calculo = calcularLinea({
          cantidad: linea.cantidad, precioCent: precio,
          descuentoPctBp, descuentoCent: linea.descuentoCent,
          tasaBp: Number(impuesto?.tasaBp ?? 0), exento
        })
        validarSerieYLote(ctx.empresaId, producto, linea, almacenId)

        const lineaId = repo.insertarLinea(db, {
          empresaId: ctx.empresaId, docId, productoId: Number(producto.id),
          descripcion: linea.descripcion || String(producto.descripcion),
          cantidad: redondearCantidad(linea.cantidad), precioCent: precio,
          descuentoPctBp, descuentoCent: calculo.descuentoCent,
          impuestoId: impuesto ? Number(impuesto.id) : null,
          impuestoCodigo: String(impuesto?.codigo ?? ''), tasaBp: exento ? 0 : Number(impuesto?.tasaBp ?? 0),
          exento, impuestoCent: calculo.impuestoCent,
          subtotalCent: calculo.subtotalCent, totalCent: calculo.totalCent,
          numeroSerie, lote
        })

        if (DOCUMENTOS_CON_STOCK.has(input.tipo)) {
          const esDevolucion = ['DEVOLUCION_VENTA', 'NOTA_CREDITO'].includes(input.tipo)
          let costoUnitCent = 0
          if (esDevolucion) {
            const originales = origen ? repo.listarLineas(db, ctx.empresaId, Number(origen.id)) : []
            const previa = originales.find((l) => Number(l.productoId) === Number(producto.id))
            costoUnitCent = previa ? Number(previa.costoUnitCent ?? 0) : 0
          }
          const cantidad = redondearCantidad(linea.cantidad) * (esDevolucion ? 1 : -1)
          const movimiento = inventario.movimientoDocumento(ctx, {
            tipo: esDevolucion ? 'DEV_VENTA' : 'VENTA',
            productoId: Number(producto.id), almacenId, cantidad,
            costoUnitCent, docTipo: input.tipo, docId, docLineaId: lineaId,
            motivo: motivo || comentarios,
            referencia: numero, ...(esDevolucion ? { recalcular: false } : {})
          })
          repo.setCostoLinea(db, ctx.empresaId, lineaId, movimiento.costoUnitCent)
          costoTotalCent += Math.abs(movimiento.costoTotalCent)
        }
        consumirSerieYLote(ctx.empresaId, producto, linea, docId, input.tipo, almacenId,
          ['DEVOLUCION_VENTA', 'NOTA_CREDITO'].includes(input.tipo) ? -1 : 1)
        calculadas.push(calculo)
      }

      const totales = { ...resumenLineas(calculadas), costoTotalCent }
      repo.actualizarTotales(db, ctx.empresaId, docId, totales)

      if (input.tipo === 'FACTURA_CREDITO') {
        registrarCxC(ctx, docId, numero, cliente, totales.totalCent, fecha, vencimiento)
      }
      registrarPagos(ctx, docId, input.tipo, totales.totalCent, input.pagos, opciones.sesionCajaId ?? null)
      audit(ctx, 'CREAR', 'documentos_venta', docId, null, {
        numero, tipo: input.tipo, clienteId: input.clienteId,
        totalCent: totales.totalCent, esNcf
      })
      return { id: docId, numero, totalCent: totales.totalCent, esNcf }
    })()
  }

  function conducesPendientes(ctx: SessionContext, docId: number) {
    const lineas = repo.listarLineas(db, ctx.empresaId, docId)
    return lineas.filter((l) => Number(l.cantidad) - Number(l.cantidadEntregada ?? 0) > 1e-9)
  }

  return {
    crearDocumento,

    factura(ctx: SessionContext, input: DocumentoVentaInput) {
      return crearDocumento(ctx, input, { modulo: 'ventas' })
    },

    cotizacion(ctx: SessionContext, input: CotizacionCarritoInput) {
      return crearDocumento(ctx, { ...input, tipo: 'COTIZACION', motivo: '' }, { modulo: 'cotizaciones' })
    },

    pedido(ctx: SessionContext, input: CotizacionCarritoInput) {
      return crearDocumento(ctx, { ...input, tipo: 'PEDIDO', motivo: '' }, { modulo: 'cotizaciones' })
    },

    crearConduce(ctx: SessionContext, input: ConduceInput) {
      requirePermission(ctx, 'ventas.crear')
      const doc = repo.getDocumento(db, ctx.empresaId, input.docVentaId)
      if (!doc) throw errors.notFound('Documento de venta')
      if (['ANULADO', 'PENDIENTE'].includes(String(doc.estado))) {
        throw errors.conflict('El documento no permite emitir conduces en su estado actual.')
      }
      return db.transaction(() => {
        const numero = nextSerieNumber(db, ctx.empresaId, 'CONDUCE')
        const conduceId = repo.insertarConduce(db, ctx.empresaId, numero, input.docVentaId, hoy(), ctx.userId)
        for (const linea of input.lineas) {
          const original = repo.getLinea(db, ctx.empresaId, linea.docLineaId)
          if (!original || Number(original.docId) !== input.docVentaId) {
            throw errors.validation('Una línea del conduce no pertenece al documento.')
          }
          const pendiente = Number(original.cantidad) - Number(original.cantidadEntregada ?? 0)
          if (linea.cantidad - pendiente > 1e-9) {
            throw errors.conflict(`La línea ${original.descripcion} ya está totalmente entregada o la cantidad excede el pendiente.`)
          }
          repo.insertarConduceLinea(db, ctx.empresaId, conduceId, linea.docLineaId, linea.cantidad)
        }
        audit(ctx, 'CREAR', 'conduces', conduceId, null, { numero, docVentaId: input.docVentaId })
        return { id: conduceId, numero }
      })()
    },

    registrarEntrega(ctx: SessionContext, input: EntregaInput) {
      requirePermission(ctx, 'ventas.modificar')
      const conduce = repo.getConduce(db, ctx.empresaId, input.conduceId)
      if (!conduce) throw errors.notFound('Conduce')
      if (conduce.estado === 'ANULADO') throw errors.conflict('El conduce está anulado.')
      return db.transaction(() => {
        const lineas = repo.listarConduceLineas(db, ctx.empresaId, input.conduceId)
        for (const entrega of input.lineas) {
          const linea = lineas.find((l) => Number(l.id) === entrega.conduceLineaId)
          if (!linea) throw errors.validation('Una línea del conduce no existe.')
          const pendiente = Number(linea.cantidad) - Number(linea.cantidadEntregada ?? 0)
          if (entrega.cantidad - pendiente > 1e-9) {
            throw errors.conflict(`La cantidad entregada excede el pendiente de ${linea.descripcion}.`)
          }
          repo.incrementarEntregado(db, ctx.empresaId, Number(linea.docLineaId), entrega.cantidad)
        }
        const restantes = conducesPendientes(ctx, Number(conduce.docVentaId))
        if (restantes.length === 0) repo.setEstadoConduce(db, ctx.empresaId, input.conduceId, 'COMPLETO')
        audit(ctx, 'MODIFICAR', 'conduces', input.conduceId, null, { entregas: input.lineas })
        return { id: input.conduceId, completo: restantes.length === 0 }
      })()
    },

    conduces(ctx: SessionContext) {
      requirePermission(ctx, 'ventas.consultar')
      return repo.listarConduces(db, ctx.empresaId)
    },

    detalleConduce(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'ventas.consultar')
      const cabecera = repo.getConduce(db, ctx.empresaId, id)
      if (!cabecera) throw errors.notFound('Conduce')
      return { cabecera, lineas: repo.listarConduceLineas(db, ctx.empresaId, id) }
    },

    anular(ctx: SessionContext, input: AnularDocumentoInput) {
      const motivo = input.motivo?.trim() || 'Anulación solicitada'
      const doc = repo.getDocumento(db, ctx.empresaId, input.id)
      if (!doc) throw errors.notFound('Documento de venta')
      requirePermission(ctx, esCotizacion(doc.tipo) ? 'cotizaciones.anular' : 'ventas.anular')
      if (doc.estado === 'ANULADO') throw errors.conflict('El documento ya está anulado.')
      return db.transaction(() => {
        const mueveStock = DOCUMENTOS_CON_STOCK.has(String(doc.tipo))
        let notaId: number | null = null
        if (mueveStock) {
          const { numero } = numerar(ctx.empresaId, 'NOTA_CREDITO', hoy())
          const lineas = repo.listarLineas(db, ctx.empresaId, Number(doc.id))
          notaId = repo.insertarDocumento(db, {
            empresaId: ctx.empresaId, tipo: 'NOTA_CREDITO', numero, esNcf: false,
            clienteId: Number(doc.clienteId), clienteNombre: String(doc.clienteNombre),
            clienteRnc: String(doc.clienteRnc), fecha: hoy(), vencimiento: '',
            vendedorId: doc.vendedorId ? Number(doc.vendedorId) : null,
            almacenId: doc.almacenId ? Number(doc.almacenId) : null,
            condicion: 'CONTADO', estado: 'ACTIVO', usuarioId: ctx.userId,
            docOrigenId: Number(doc.id), motivo, comentarios: 'Reversa por anulación'
          })
          for (const linea of lineas) {
            const nuevaLineaId = repo.insertarLinea(db, {
              empresaId: ctx.empresaId, docId: notaId, productoId: Number(linea.productoId),
              descripcion: String(linea.descripcion), cantidad: Number(linea.cantidad),
              precioCent: Number(linea.precioCent), descuentoPctBp: Number(linea.descuentoPctBp ?? 0),
              descuentoCent: Number(linea.descuentoCent ?? 0),
              impuestoId: linea.impuestoId ? Number(linea.impuestoId) : null,
              impuestoCodigo: String(linea.impuestoCodigo ?? ''), tasaBp: Number(linea.tasaBp ?? 0),
              exento: Boolean(linea.exento), impuestoCent: Number(linea.impuestoCent ?? 0),
              subtotalCent: Number(linea.subtotalCent), totalCent: Number(linea.totalCent),
              numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? '')
            })
            inventario.movimientoDocumento(ctx, {
              tipo: 'DEV_VENTA', productoId: Number(linea.productoId),
              almacenId: Number(doc.almacenId), cantidad: Number(linea.cantidad),
              costoUnitCent: Number(linea.costoUnitCent ?? 0), docTipo: 'NOTA_CREDITO',
              docId: notaId, docLineaId: nuevaLineaId,
              motivo, referencia: numero, recalcular: false
            })
            const producto = repo.getProducto(db, ctx.empresaId, Number(linea.productoId))
            if (producto) {
              consumirSerieYLote(ctx.empresaId, producto, {
                numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? ''),
                cantidad: Number(linea.cantidad)
              }, notaId, 'NOTA_CREDITO', Number(doc.almacenId), -1)
            }
          }
          repo.actualizarTotales(db, ctx.empresaId, notaId, {
            subtotalCent: Number(doc.subtotalCent), descuentoCent: Number(doc.descuentoCent),
            impuestoCent: Number(doc.impuestoCent), totalCent: Number(doc.totalCent),
            costoTotalCent: Number(doc.costoTotalCent)
          })
          audit(ctx, 'CREAR', 'documentos_venta', notaId, null, { tipo: 'NOTA_CREDITO', origina: doc.id })
        }

        const cxc = aux.getCxcPorDocumento(db, ctx.empresaId, Number(doc.id))
        if (cxc) {
          aux.anularCxc(db, ctx.empresaId, Number(doc.id))
          aux.movimientoCxc(db, {
            empresaId: ctx.empresaId, clienteId: Number(doc.clienteId),
            cxcDocumentoId: Number(cxc.id), docVentaId: Number(doc.id),
            tipo: 'ANULACION', montoCent: Number(doc.totalCent),
            referencia: motivo, usuarioId: ctx.userId
          })
          aux.ajustarBalanceCliente(db, ctx.empresaId, Number(doc.clienteId), -Number(doc.totalCent))
        }
        const pagos = repo.listarPagos(db, ctx.empresaId, Number(doc.id))
        for (const pago of pagos.filter((p) => p.metodo === 'EFECTIVO')) {
          const cajaId = pago.cajaSesionId
            ? (db.prepare('SELECT caja_id FROM caja_sesiones WHERE id = ?').get(pago.cajaSesionId) as { caja_id: number } | undefined)?.caja_id
            : undefined
          aux.movimientoCaja(db, {
            empresaId: ctx.empresaId, cajaSesionId: pago.cajaSesionId ? Number(pago.cajaSesionId) : null,
            cajaId: cajaId ?? Number(aux.getCajaPrincipal(db, ctx.empresaId)?.id ?? 0),
            tipo: 'EGRESO', metodo: 'EFECTIVO', montoCent: Number(pago.montoCent),
            docTipo: 'NOTA_CREDITO', docId: notaId, descripcion: `Reversa por anulación: ${motivo}`,
            usuarioId: ctx.userId
          })
        }
        repo.setEstadoDocumento(db, ctx.empresaId, Number(doc.id), 'ANULADO')
        audit(ctx, 'ANULAR', 'documentos_venta', Number(doc.id), { estado: doc.estado }, { estado: 'ANULADO', motivo })
        return { id: Number(doc.id), notaCreditoId: notaId }
      })()
    },

    convertir(ctx: SessionContext, input: ConvertirDocumentoInput) {
      const origen = repo.getDocumento(db, ctx.empresaId, input.id)
      if (!origen) throw errors.notFound('Documento de origen')
      if (['ANULADO', 'CONVERTIDA'].includes(String(origen.estado))) {
        throw errors.conflict('El documento ya fue convertido o anulado.')
      }
      if (input.tipoDestino === 'PEDIDO') requirePermission(ctx, 'cotizaciones.crear')
      else requirePermission(ctx, 'ventas.crear')
      const lineas = repo.listarLineas(db, ctx.empresaId, Number(origen.id)).map((l) => ({
        productoId: Number(l.productoId), cantidad: Number(l.cantidad),
        precioCent: Number(l.precioCent), impuestoId: l.impuestoId ? Number(l.impuestoId) : undefined,
        exento: Boolean(l.exento), descuentoPctBp: Number(l.descuentoPctBp ?? 0),
        numeroSerie: String(l.numeroSerie ?? ''), lote: String(l.lote ?? '')
      }))
      return db.transaction(() => {
        const destino = crearDocumento(ctx, {
          tipo: input.tipoDestino, clienteId: Number(origen.clienteId),
          almacenId: input.almacenId, vendedorId: input.vendedorId,
          comentarios: input.comentarios ?? '', motivo: `Convertido de ${origen.numero}`,
          docOrigenId: Number(origen.id), lineas
        }, { modulo: input.tipoDestino === 'PEDIDO' ? 'cotizaciones' : 'ventas' })
        repo.setEstadoDocumento(db, ctx.empresaId, Number(origen.id), 'CONVERTIDA')
        audit(ctx, 'MODIFICAR', 'documentos_venta', Number(origen.id), { estado: origen.estado }, { estado: 'CONVERTIDA', destino: destino.id })
        return destino
      })()
    },

    aprobar(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'cotizaciones.aprobar')
      const doc = repo.getDocumento(db, ctx.empresaId, id)
      if (!doc || !['COTIZACION', 'PEDIDO'].includes(String(doc.tipo))) throw errors.notFound('Cotización o pedido')
      if (doc.estado === 'ANULADO') throw errors.conflict('El documento está anulado.')
      repo.setEstadoDocumento(db, ctx.empresaId, id, 'APROBADA')
      audit(ctx, 'MODIFICAR', 'documentos_venta', id, { estado: doc.estado }, { estado: 'APROBADA' })
      return { id }
    },

    /**
     * Catálogos de apoyo para los formularios de Fase 6. Solo expone maestros
     * cuando el usuario tiene su permiso de consulta; los catálogos operativos
     * (almacenes, impuestos) se entregan al usuario autorizado del módulo.
     */
    catalogos(ctx: SessionContext, modulo: Modulo) {
      requirePermission(ctx, `${modulo}.consultar`)
      const maestros = (sql: string, permitido: boolean): Record<string, unknown>[] =>
        permitido ? (db.prepare(sql).all(ctx.empresaId) as Record<string, unknown>[]) : []

      return {
        clientes: maestros(`
          SELECT id, codigo, nombre, rnc_cedula AS rncCedula, limite_credito_cent AS limiteCreditoCent,
                 balance_cent AS balanceCent, condicion_pago_dias AS condicionPagoDias,
                 vendedor_id AS vendedorId
          FROM clientes WHERE empresa_id = ? AND activo = 1 ORDER BY nombre
        `, tiene(ctx, 'clientes.consultar')),
        productos: maestros(`
          SELECT id, codigo, descripcion, precio1_cent AS precio1Cent,
                 precio_minimo_cent AS precioMinimoCent, impuesto_id AS impuestoId,
                 maneja_serie AS manejaSerie, maneja_lote AS manejaLote, tipo
          FROM productos WHERE empresa_id = ? AND activo = 1 ORDER BY descripcion
        `, tiene(ctx, 'productos.consultar')),
        vendedores: maestros(`
          SELECT id, codigo, nombre FROM vendedores
          WHERE empresa_id = ? AND activo = 1 ORDER BY nombre
        `, tiene(ctx, 'vendedores.consultar')),
        almacenes: db.prepare(`
          SELECT id, codigo, nombre FROM almacenes
          WHERE empresa_id = ? AND activo = 1 ORDER BY principal DESC, nombre
        `).all(ctx.empresaId) as Record<string, unknown>[],
        impuestos: db.prepare(`
          SELECT id, codigo, descripcion, tasa_bp AS tasaBp, exento FROM impuestos
          WHERE empresa_id = ? AND activo = 1 ORDER BY codigo
        `).all(ctx.empresaId) as Record<string, unknown>[],
        impuestoPorDefecto: String((db.prepare(`
          SELECT valor FROM parametros WHERE empresa_id = ? AND clave = 'itbis_por_defecto'
        `).get(ctx.empresaId) as { valor?: string } | undefined)?.valor ?? 'ITBIS18')
      }
    },

    documentos(ctx: SessionContext, filtro: DocumentosFiltroInput) {
      requirePermission(ctx, 'ventas.consultar')
      return repo.listarDocumentos(db, ctx.empresaId, filtro)
    },

    /** Listado aislado para cotizaciones/pedidos; nunca expone facturas. */
    documentosCotizaciones(ctx: SessionContext, filtro: DocumentosFiltroInput) {
      requirePermission(ctx, 'cotizaciones.consultar')
      return repo.listarDocumentos(db, ctx.empresaId, {
        ...filtro,
        tipo: filtro.tipo === 'PEDIDO' ? 'PEDIDO' : 'COTIZACION'
      })
    },

    detalle(ctx: SessionContext, id: number) {
      const cabecera = repo.getDocumento(db, ctx.empresaId, id)
      if (!cabecera) throw errors.notFound('Documento de venta')
      requirePermission(ctx, esCotizacion(cabecera.tipo) ? 'cotizaciones.consultar' : 'ventas.consultar')
      const lineas = repo.listarLineas(db, ctx.empresaId, id)
      const pagos = repo.listarPagos(db, ctx.empresaId, id)
      if (!tiene(ctx, 'ventas.ganancia')) {
        for (const linea of lineas) delete linea.costoUnitCent
        delete cabecera.costoTotalCent
      }
      return { cabecera, lineas, pagos }
    },

    datosImpresion(ctx: SessionContext, input: ImprimirDocumentoInput) {
      const doc = repo.getDocumento(db, ctx.empresaId, input.id)
      if (!doc) throw errors.notFound('Documento de venta')
      const permiso = esCotizacion(doc.tipo) && !tiene(ctx, 'ventas.imprimir')
        ? 'cotizaciones.imprimir'
        : doc.tipo === 'POS' && !tiene(ctx, 'ventas.imprimir')
          ? 'pos.imprimir'
          : 'ventas.imprimir'
      requirePermission(ctx, permiso)
      return {
        formato: input.formato ?? 'CARTA',
        empresa: repo.camel(getEmpresa(db, ctx.empresaId)) ?? {},
        documento: doc,
        lineas: repo.listarLineas(db, ctx.empresaId, Number(doc.id)),
        pagos: repo.listarPagos(db, ctx.empresaId, Number(doc.id))
      }
    },

    async exportar(ctx: SessionContext, filtro: DocumentosFiltroInput) {
      requirePermission(ctx, 'ventas.exportar')
      const filas = repo.listarDocumentos(db, ctx.empresaId, filtro)
      const columnas = [
        { header: 'Tipo', key: 'tipo' }, { header: 'Número/NCF', key: 'numero' },
        { header: 'Fecha', key: 'fecha' }, { header: 'Cliente', key: 'clienteNombre' },
        { header: 'RNC/Cédula', key: 'clienteRnc' }, { header: 'Estado', key: 'estado' },
        { header: 'Subtotal', key: 'subtotal' }, { header: 'Descuento', key: 'descuento' },
        { header: 'ITBIS', key: 'impuesto' }, { header: 'Total', key: 'total' }
      ]
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Ventas')
      ws.columns = columnas.map((c) => ({ ...c, width: Math.max(14, c.header.length + 3) }))
      ws.getRow(1).font = { bold: true }
      for (const fila of filas) {
        ws.addRow({
          ...fila,
          subtotal: Number(fila.subtotalCent ?? 0) / 100,
          descuento: Number(fila.descuentoCent ?? 0) / 100,
          impuesto: Number(fila.impuestoCent ?? 0) / 100,
          total: Number(fila.totalCent ?? 0) / 100
        })
      }
      const buffer = await wb.xlsx.writeBuffer()
      return { filename: `ventas_${hoy()}.xlsx`, base64: Buffer.from(buffer).toString('base64') }
    }
  }
}

import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { errors } from '@shared/errors'
import { writeAudit } from '../repositories/auditoria.repo'
import { camel } from '../repositories/ventas.repo'
import { getEmpresa, getSerie, nextSerieNumber } from '../repositories/configuracion.repo'
import * as repo from '../repositories/compras.repo'
import * as aux from '../repositories/auxiliares.repo'
import * as cxp from '../repositories/cxp.repo'
import { calcularLinea, resumenLineas, type LineaCalculada } from '../core/impuestos'
import { dividirCentavos, redondear, redondearCantidad } from '../core/dinero'
import type {
  DocumentoCompraInput, DocumentosFiltroCompraInput, RecepcionInput,
  ConvertirCompraInput, AnularCompraInput, ImprimirCompraInput,
  LineaCompraInput, PagoCompraInput
} from '@shared/schemas/compras'

type InventarioService = ReturnType<typeof import('./inventario.service').createInventarioService>
type Fila = import('../repositories/ventas.repo').Fila

const EPS = 1e-9

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function pendiente(linea: Fila): number {
  return redondearCantidad(Number(linea.cantidad ?? 0) - Number(linea.cantidadRecibida ?? 0))
}

function gastoProporcional(cantidad: number, cantidadOrigen: number, gastoCent: number): number {
  if (cantidadOrigen <= EPS || gastoCent <= 0) return 0
  return redondear(gastoCent * (cantidad / cantidadOrigen))
}

/**
 * Fase 7 — Compras. Un documento y todos sus efectos (kardex, costo promedio,
 * CxP y caja) se escriben en una sola transacción. Los NCF del proveedor solo
 * se guardan como referencia; este módulo nunca los genera.
 */
export function createComprasService(db: Db, inventario: InventarioService) {
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
      const row = db.prepare(`
        SELECT id FROM almacenes WHERE id = ? AND empresa_id = ? AND activo = 1
      `).get(id, ctx.empresaId) as { id: number } | undefined
      if (!row) throw errors.notFound('Almacén')
      return row.id
    }
    const row = db.prepare(`
      SELECT id FROM almacenes WHERE empresa_id = ? AND activo = 1 ORDER BY id LIMIT 1
    `).get(ctx.empresaId) as { id: number } | undefined
    if (!row) throw errors.notFound('Almacén')
    return row.id
  }

  /** Numeración interna. Aunque la serie se marque como NCF, aquí no se emite NCF. */
  function numerar(empresaId: number, tipo: string): string {
    const serie = getSerie(db, empresaId, tipo)
    if (!serie || !serie.activa) {
      throw errors.conflict(`No hay serie activa para ${tipo}. Configure una serie antes de continuar.`)
    }
    return nextSerieNumber(db, empresaId, tipo)
  }

  function validarSerieYLote(empresaId: number, producto: Fila, linea: LineaCompraInput): void {
    if (producto.manejaSerie && !linea.numeroSerie?.trim()) {
      throw errors.validation(`El producto ${producto.descripcion} requiere número de serie.`)
    }
    if (producto.manejaLote && !linea.lote?.trim()) {
      throw errors.validation(`El producto ${producto.descripcion} requiere lote.`)
    }
    if (producto.manejaSerie && linea.numeroSerie) {
      const actual = db.prepare(`
        SELECT estado FROM series_producto WHERE empresa_id = ? AND producto_id = ? AND serie = ?
      `).get(empresaId, producto.id, linea.numeroSerie) as { estado: string } | undefined
      if (actual && actual.estado === 'VENDIDO') {
        throw errors.conflict(`La serie ${linea.numeroSerie} ya fue vendida; no puede recibirse de nuevo.`)
      }
    }
    void empresaId
  }

  function registrarSerieYLoteEntrada(
    empresaId: number, producto: Fila, linea: LineaCompraInput,
    almacenId: number, docId: number, docTipo: string
  ): void {
    if (producto.manejaSerie && linea.numeroSerie) {
      db.prepare(`
        INSERT INTO series_producto (empresa_id, producto_id, almacen_id, serie, estado, doc_tipo, doc_id)
        VALUES (?, ?, ?, ?, 'DISPONIBLE', ?, ?)
        ON CONFLICT(empresa_id, producto_id, serie) DO UPDATE SET
          estado = 'DISPONIBLE', doc_tipo = excluded.doc_tipo, doc_id = excluded.doc_id
      `).run(empresaId, producto.id, almacenId, linea.numeroSerie, docTipo, docId)
    }
    if (producto.manejaLote && linea.lote) {
      db.prepare(`
        INSERT INTO lotes_producto (empresa_id, producto_id, almacen_id, lote, vencimiento, cantidad)
        VALUES (?, ?, ?, ?, '', ?)
        ON CONFLICT(empresa_id, producto_id, almacen_id, lote) DO UPDATE SET
          cantidad = MAX(0, lotes_producto.cantidad + excluded.cantidad)
      `).run(empresaId, producto.id, almacenId, linea.lote, redondearCantidad(linea.cantidad))
    }
  }

  function registrarSerieYLoteSalida(
    empresaId: number, producto: Fila, linea: { numeroSerie?: string; lote?: string; cantidad: number },
    almacenId: number, docId: number, docTipo: string
  ): void {
    if (producto.manejaSerie && linea.numeroSerie) {
      db.prepare(`
        UPDATE series_producto SET estado = 'DEVUELTO', doc_tipo = ?, doc_id = ?
        WHERE empresa_id = ? AND producto_id = ? AND serie = ?
      `).run(docTipo, docId, empresaId, producto.id, linea.numeroSerie)
    }
    if (producto.manejaLote && linea.lote) {
      db.prepare(`
        UPDATE lotes_producto SET cantidad = MAX(0, cantidad - ?)
        WHERE empresa_id = ? AND producto_id = ? AND almacen_id = ? AND lote = ?
      `).run(redondearCantidad(linea.cantidad), empresaId, producto.id, almacenId, linea.lote)
    }
  }

  function registrarPagos(
    ctx: SessionContext, docId: number, totalCent: number,
    pagos: PagoCompraInput[] | undefined, credito: boolean
  ): void {
    if (credito) return
    const lista = pagos?.length
      ? pagos
      : [{ metodo: 'EFECTIVO' as const, montoCent: totalCent, referencia: '' }]
    const suma = lista.reduce((s, p) => s + p.montoCent, 0)
    if (suma !== totalCent) {
      throw errors.conflict(`Los pagos suman ${suma} centavos y la factura totaliza ${totalCent} centavos.`)
    }
    const sesion = aux.getSesionAbierta(db, ctx.empresaId)
    for (const pago of lista) {
      let movimientoId: number | null = null
      if (pago.metodo === 'EFECTIVO' && sesion) {
        movimientoId = aux.movimientoCaja(db, {
          empresaId: ctx.empresaId, cajaSesionId: Number(sesion.id), cajaId: Number(sesion.cajaId),
          tipo: 'EGRESO', metodo: pago.metodo, montoCent: pago.montoCent,
          docTipo: 'FACTURA_COMPRA', docId, descripcion: 'Pago de factura de compra',
          usuarioId: ctx.userId
        })
      }
      repo.insertarPago(db, ctx.empresaId, docId, {
        metodo: pago.metodo, montoCent: pago.montoCent, referencia: pago.referencia ?? '',
        cajaSesionId: sesion ? Number(sesion.id) : null, cajaMovimientoId: movimientoId,
        usuarioId: ctx.userId
      })
    }
  }

  function registrarCxp(
    ctx: SessionContext, docId: number, numero: string, proveedor: Fila,
    totalCent: number, fecha: string, vencimiento: string
  ): void {
    const cxpId = cxp.crearCxp(db, {
      empresaId: ctx.empresaId, proveedorId: Number(proveedor.id), docCompraId: docId,
      numeroDocumento: numero, fecha, vencimiento, montoCent: totalCent
    })
    if (totalCent > 0) {
      cxp.movimientoCxp(db, {
        empresaId: ctx.empresaId, proveedorId: Number(proveedor.id), cxpDocumentoId: cxpId,
        docCompraId: docId, tipo: 'CARGO', montoCent: totalCent,
        referencia: numero, usuarioId: ctx.userId
      })
      cxp.ajustarBalanceProveedor(db, ctx.empresaId, Number(proveedor.id), totalCent)
    }
  }

  function reversarPagosEfectivo(ctx: SessionContext, docId: number, motivo: string, docTipo: string, docIdDestino: number | null): void {
    for (const pago of repo.listarPagos(db, ctx.empresaId, docId)
      .filter((p) => p.metodo === 'EFECTIVO' && p.cajaMovimientoId)) {
      const cajaId = pago.cajaSesionId
        ? (db.prepare('SELECT caja_id FROM caja_sesiones WHERE id = ?').get(pago.cajaSesionId) as { caja_id: number } | undefined)?.caja_id
        : undefined
      aux.movimientoCaja(db, {
        empresaId: ctx.empresaId, cajaSesionId: pago.cajaSesionId ? Number(pago.cajaSesionId) : null,
        cajaId: cajaId ?? Number(aux.getCajaPrincipal(db, ctx.empresaId)?.id ?? 0),
        tipo: 'INGRESO', metodo: 'EFECTIVO', montoCent: Number(pago.montoCent),
        docTipo, docId: docIdDestino, descripcion: `Reversa por ${motivo}`,
        usuarioId: ctx.userId
      })
    }
  }

  function movimientosPorLinea(docTipo: string, docId: number, empresaId: number): Map<number, Fila> {
    const filas = db.prepare(`
      SELECT * FROM movimientos_inventario
      WHERE empresa_id = ? AND doc_tipo = ? AND doc_id = ? AND tipo = 'COMPRA'
    `).all(empresaId, docTipo, docId) as Fila[]
    return new Map(filas.map((f) => {
      const mov = camel(f) as Fila
      return [Number(mov.docLineaId), mov]
    }))
  }

  function lineaDesdeFila(linea: Fila, cantidad: number): LineaCompraInput {
    return {
      productoId: Number(linea.productoId),
      docLineaId: Number(linea.id),
      cantidad,
      precioCent: Number(linea.precioCent ?? 0),
      descuentoPctBp: Number(linea.descuentoPctBp ?? 0),
      descuentoCent: Number(linea.descuentoCent ?? 0),
      gastoCent: Number(linea.gastoCent ?? 0),
      impuestoId: linea.impuestoId ? Number(linea.impuestoId) : undefined,
      exento: Boolean(linea.exento),
      numeroSerie: String(linea.numeroSerie ?? ''),
      lote: String(linea.lote ?? '')
    }
  }

  function lineasPendientesOrden(ctx: SessionContext, ordenId: number): Fila[] {
    return repo.listarLineas(db, ctx.empresaId, ordenId)
      .filter((linea) => pendiente(linea) > EPS)
  }

  /** Reversa de inventario. Se usa tanto en devoluciones como en anulaciones. */
  function crearDevolucionInterna(
    ctx: SessionContext, origen: Fila,
    items: { docLineaId: number; cantidad: number }[], motivo: string,
    ajustarCxp = true
  ): { id: number; numero: string; totalCent: number } {
    const fecha = hoy()
    const numero = numerar(ctx.empresaId, 'DEVOLUCION_COMPRA')
    const docId = repo.insertarDocumento(db, {
      empresaId: ctx.empresaId, tipo: 'DEVOLUCION_COMPRA', numero,
      numeroProveedor: String(origen.numeroProveedor ?? ''),
      proveedorId: Number(origen.proveedorId), proveedorNombre: String(origen.proveedorNombre),
      proveedorRnc: String(origen.proveedorRnc ?? ''), fecha, vencimiento: '',
      almacenId: origen.almacenId ? Number(origen.almacenId) : null,
      condicion: 'CONTADO', estado: 'CONTABILIZADO', usuarioId: ctx.userId,
      docOrigenId: Number(origen.id), motivo, comentarios: 'Reversa de compra'
    })

    const calculadas: LineaCalculada[] = []
    const movimientos = movimientosPorLinea(String(origen.tipo), Number(origen.id), ctx.empresaId)
    let gastoTotalCent = 0
    let costoTotalCent = 0
    let reclamarCxpCent = 0

    for (const item of items) {
      const cantidad = redondearCantidad(item.cantidad)
      if (cantidad <= 0) throw errors.validation('La cantidad devuelta debe ser mayor que cero.')
      const linea = repo.getLinea(db, ctx.empresaId, item.docLineaId)
      if (!linea || Number(linea.docId) !== Number(origen.id)) {
        throw errors.validation('Una línea de devolución no pertenece al documento de origen.')
      }
      const disponible = redondearCantidad(
        Number(linea.cantidadRecibida ?? 0) - Number(linea.cantidadDevuelta ?? 0)
      )
      if (cantidad - disponible > EPS) {
        throw errors.conflict(`La cantidad devuelta excede el pendiente de ${linea.descripcion}.`)
      }
      const movimiento = movimientos.get(Number(linea.id))
      if (!movimiento) {
        if (origen.tipo === 'FACTURA_COMPRA' && origen.docOrigenId) {
          throw errors.conflict('Esta factura se recibió contra una recepción; devuelva contra esa recepción.')
        }
        throw errors.conflict(`La línea ${linea.descripcion} no tiene un movimiento de inventario que reverse.`)
      }
      const producto = repo.getProducto(db, ctx.empresaId, Number(linea.productoId))
      if (!producto) throw errors.notFound('Producto')

      const calculo = calcularLinea({
        cantidad, precioCent: Number(linea.precioCent),
        descuentoPctBp: Number(linea.descuentoPctBp ?? 0),
        descuentoCent: Number(linea.descuentoCent ?? 0),
        tasaBp: Number(linea.tasaBp ?? 0), exento: Boolean(linea.exento)
      })
      const gastoCent = gastoProporcional(cantidad, Number(linea.cantidad ?? 0), Number(linea.gastoCent ?? 0))
      const totalLineaCent = calculo.totalCent + gastoCent
      const nuevaLineaId = repo.insertarLinea(db, {
        empresaId: ctx.empresaId, docId, productoId: Number(linea.productoId),
        descripcion: String(linea.descripcion), cantidad, cantidadRecibida: 0,
        cantidadDevuelta: 0, precioCent: Number(linea.precioCent),
        descuentoPctBp: Number(linea.descuentoPctBp ?? 0),
        descuentoCent: Number(linea.descuentoCent ?? 0), gastoCent,
        impuestoId: linea.impuestoId ? Number(linea.impuestoId) : null,
        impuestoCodigo: String(linea.impuestoCodigo ?? ''), tasaBp: Number(linea.tasaBp ?? 0),
        exento: Boolean(linea.exento), impuestoCent: calculo.impuestoCent,
        subtotalCent: calculo.subtotalCent, totalCent: totalLineaCent,
        costoUnitCent: Number(movimiento.costoUnitCent),
        numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? '')
      })

      const reversa = inventario.movimientoDocumento(ctx, {
        tipo: 'DEV_COMPRA', productoId: Number(linea.productoId),
        almacenId: Number(origen.almacenId), cantidad: -cantidad,
        costoUnitCent: Number(movimiento.costoUnitCent), docTipo: 'DEVOLUCION_COMPRA',
        docId, docLineaId: nuevaLineaId, motivo, referencia: numero, recalcular: false
      })
      registrarSerieYLoteSalida(
        ctx.empresaId, producto, {
          numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? ''), cantidad
        }, Number(origen.almacenId), docId, 'DEVOLUCION_COMPRA'
      )
      repo.incrementarDevuelto(db, ctx.empresaId, Number(linea.id), cantidad)
      calculadas.push(calculo)
      gastoTotalCent += gastoCent
      costoTotalCent += Math.abs(reversa.costoTotalCent)
      reclamarCxpCent += totalLineaCent
    }

    const resumen = resumenLineas(calculadas)
    const totalCent = resumen.totalCent + gastoTotalCent
    repo.actualizarTotales(db, ctx.empresaId, docId, {
      subtotalCent: resumen.subtotalCent, descuentoCent: resumen.descuentoCent,
      impuestoCent: resumen.impuestoCent, gastoCent: gastoTotalCent,
      totalCent, costoTotalCent
    })

    if (ajustarCxp && origen.tipo === 'FACTURA_COMPRA') {
      const cxpDocumento = cxp.getCxpPorDocumento(db, ctx.empresaId, Number(origen.id))
      if (cxpDocumento && cxpDocumento.estado !== 'ANULADO') {
        const aplicado = cxp.abonarCxp(db, ctx.empresaId, Number(origen.id), reclamarCxpCent)
        if (aplicado > 0) {
          cxp.movimientoCxp(db, {
            empresaId: ctx.empresaId, proveedorId: Number(origen.proveedorId),
            cxpDocumentoId: Number(cxpDocumento.id), docCompraId: Number(origen.id),
            tipo: 'ABONO', montoCent: aplicado, referencia: numero, usuarioId: ctx.userId
          })
          cxp.ajustarBalanceProveedor(db, ctx.empresaId, Number(origen.proveedorId), -aplicado)
        }
      }
    }

    audit(ctx, 'CREAR', 'documentos_compra', docId, null, {
      tipo: 'DEVOLUCION_COMPRA', origen: origen.id, numero, totalCent
    })
    return { id: docId, numero, totalCent }
  }

  /** Único punto de alta de documentos de compra (excepto recepciones). */
  function crearDocumento(
    ctx: SessionContext, input: DocumentoCompraInput
  ): { id: number; numero: string; totalCent: number } {
    requirePermission(ctx, input.tipo === 'DEVOLUCION_COMPRA' ? 'compras.devolucion' : 'compras.crear')
    if (input.tipo === 'RECEPCION') {
      throw errors.validation('Use compras.recepcion para registrar la mercancía recibida.')
    }

    const proveedor = repo.getProveedor(db, ctx.empresaId, input.proveedorId)
    if (!proveedor) throw errors.notFound('Proveedor')
    const almacenId = almacenPorDefecto(ctx, input.almacenId)
    const fecha = input.fecha ?? hoy()
    const origen = input.docOrigenId ? repo.getDocumento(db, ctx.empresaId, input.docOrigenId) : undefined
    if (input.docOrigenId && !origen) throw errors.notFound('Documento de origen')
    if (origen && ['ANULADO', 'CONVERTIDA'].includes(String(origen.estado))) {
      throw errors.conflict('El documento de origen ya no permite nuevas conversiones.')
    }

    if (input.tipo === 'DEVOLUCION_COMPRA') {
      if (!origen || !['RECEPCION', 'FACTURA_COMPRA'].includes(String(origen.tipo))) {
        throw errors.validation('La devolución requiere una recepción o factura de origen.')
      }
      const items = input.lineas.filter((l) => l.docLineaId).map((l) => ({
        docLineaId: Number(l.docLineaId), cantidad: l.cantidad
      }))
      if (!items.length) throw errors.validation('Indique las líneas que se devuelven.')
      return db.transaction(() => crearDevolucionInterna(ctx, origen, items, input.motivo ?? 'Devolución de compra'))()
    }

    const credito = input.tipo === 'FACTURA_COMPRA' && Boolean(input.credito)
    const condicion = credito ? 'CREDITO' : 'CONTADO'
    const estado = input.tipo === 'FACTURA_COMPRA' ? 'CONTABILIZADO' : 'PENDIENTE'
    const vencimiento = credito
      ? (input.vencimiento ?? sumarDias(fecha, Number(proveedor.condicionPagoDias ?? 0)))
      : (input.vencimiento ?? '')
    const numeroProveedor = input.numeroProveedor || String(origen?.numeroProveedor ?? '')

    let lineas: LineaCompraInput[] = input.lineas
    if (input.tipo === 'FACTURA_COMPRA' && origen?.tipo === 'RECEPCION') {
      lineas = repo.listarLineas(db, ctx.empresaId, Number(origen.id)).map((l) =>
        lineaDesdeFila(l, redondearCantidad(Number(l.cantidadRecibida ?? l.cantidad)))
      )
    } else if (input.tipo === 'FACTURA_COMPRA' && origen?.tipo === 'ORDEN_COMPRA') {
      lineas = lineasPendientesOrden(ctx, Number(origen.id)).map((l) => lineaDesdeFila(l, pendiente(l)))
      if (!lineas.length) {
        throw errors.conflict('La orden ya fue recibida en su totalidad; facture desde la recepción.')
      }
    }

    return db.transaction(() => {
      const numero = numerar(ctx.empresaId, input.tipo)
      const docId = repo.insertarDocumento(db, {
        empresaId: ctx.empresaId, tipo: input.tipo, numero, numeroProveedor,
        proveedorId: Number(proveedor.id), proveedorNombre: String(proveedor.nombreComercial),
        proveedorRnc: String(proveedor.rnc ?? ''), fecha, vencimiento, almacenId,
        condicion, estado, usuarioId: ctx.userId,
        docOrigenId: origen ? Number(origen.id) : null,
        motivo: input.motivo ?? '', comentarios: input.comentarios ?? ''
      })

      const mueveStock = input.tipo === 'FACTURA_COMPRA' && origen?.tipo !== 'RECEPCION'
      const calculadas: LineaCalculada[] = []
      let gastoTotalCent = 0
      let gastoLineasCent = 0
      let costoTotalCent = 0

      for (const linea of lineas) {
        const producto = repo.getProducto(db, ctx.empresaId, linea.productoId)
        if (!producto) throw errors.notFound('Producto')
        const precio = linea.precioCent ?? (
          Number(producto.costoUltimaCompraCent ?? 0) > 0
            ? Number(producto.costoUltimaCompraCent)
            : Number(producto.costoPromedioCent ?? 0)
        )
        if (!precio && linea.precioCent === undefined) {
          throw errors.validation(`Indique el costo de ${producto.descripcion}.`)
        }
        const descuentoPctBp = linea.descuentoPctBp ?? 0
        const gastoCent = linea.gastoCent ?? 0
        const numeroSerie = linea.numeroSerie ?? ''
        const lote = linea.lote ?? ''
        const impuesto = repo.getImpuesto(
          db, ctx.empresaId,
          linea.impuestoId ?? (producto.impuestoId ? Number(producto.impuestoId) : undefined)
        )
        const exento = Boolean(linea.exento) || Boolean(impuesto?.exento)
        const calculo = calcularLinea({
          cantidad: linea.cantidad, precioCent: precio, descuentoPctBp,
          descuentoCent: linea.descuentoCent, tasaBp: Number(impuesto?.tasaBp ?? 0), exento
        })
        validarSerieYLote(ctx.empresaId, producto, { ...linea, numeroSerie, lote })

        const cantidad = redondearCantidad(linea.cantidad)
        const costoUnitCent = dividirCentavos(calculo.baseCent + gastoCent, cantidad)
        const datosLinea: Omit<repo.LineaNueva, 'empresaId' | 'docId' | 'productoId' | 'descripcion' | 'cantidad' | 'impuestoId' | 'exento'> = {
          cantidadRecibida: mueveStock || origen?.tipo === 'RECEPCION' ? cantidad : 0,
          cantidadDevuelta: 0,
          precioCent: precio, descuentoPctBp, descuentoCent: calculo.descuentoCent,
          gastoCent, impuestoCodigo: String(impuesto?.codigo ?? ''),
          tasaBp: exento ? 0 : Number(impuesto?.tasaBp ?? 0),
          impuestoCent: calculo.impuestoCent, subtotalCent: calculo.subtotalCent,
          totalCent: calculo.totalCent + gastoCent, costoUnitCent,
          numeroSerie, lote
        }
        const lineaId = repo.insertarLinea(db, {
          ...datosLinea, empresaId: ctx.empresaId, docId, productoId: Number(producto.id),
          descripcion: linea.descripcion || String(producto.descripcion), cantidad,
          impuestoId: impuesto ? Number(impuesto.id) : null, exento
        })

        if (mueveStock) {
          const movimiento = inventario.movimientoDocumento(ctx, {
            tipo: 'COMPRA', productoId: Number(producto.id), almacenId, cantidad,
            costoUnitCent, docTipo: input.tipo, docId, docLineaId: lineaId,
            motivo: input.motivo || input.comentarios, referencia: numero
          })
          registrarSerieYLoteEntrada(ctx.empresaId, producto, { ...linea, numeroSerie, lote }, almacenId, docId, input.tipo)
          costoTotalCent += Math.abs(movimiento.costoTotalCent)
          if (linea.docLineaId) {
            repo.incrementarRecibido(db, ctx.empresaId, Number(linea.docLineaId), cantidad)
          }
        } else if (origen?.tipo === 'RECEPCION' && linea.docLineaId) {
          const previa = repo.getLinea(db, ctx.empresaId, Number(linea.docLineaId))
          costoTotalCent += multiplicarCosto(Number(previa?.costoUnitCent ?? 0), cantidad)
        }

        calculadas.push(calculo)
        gastoTotalCent += gastoCent
        gastoLineasCent += gastoCent
      }

      // El gasto se capitaliza al costo y se adeuda al proveedor, pero no se
      // vuelve a gravar: el motor de impuestos ya calculó el ITBIS por línea.
      const resumen = resumenLineas(calculadas)
      const totalCent = resumen.totalCent + gastoLineasCent
      repo.actualizarTotales(db, ctx.empresaId, docId, {
        subtotalCent: resumen.subtotalCent, descuentoCent: resumen.descuentoCent,
        impuestoCent: resumen.impuestoCent, gastoCent: gastoTotalCent,
        totalCent, costoTotalCent
      })

      if (input.tipo === 'FACTURA_COMPRA') {
        if (credito) {
          registrarCxp(ctx, docId, numero, proveedor, totalCent, fecha, vencimiento)
        } else {
          registrarPagos(ctx, docId, totalCent, input.pagos, false)
        }
      }
      if (origen && input.tipo === 'FACTURA_COMPRA') {
        repo.setEstadoDocumento(db, ctx.empresaId, Number(origen.id), 'CONVERTIDA')
      }

      audit(ctx, 'CREAR', 'documentos_compra', docId, null, {
        numero, tipo: input.tipo, proveedorId: input.proveedorId,
        totalCent, condicion, docOrigenId: origen ? Number(origen.id) : null
      })
      return { id: docId, numero, totalCent }
    })()
  }

  function multiplicarCosto(costoUnitCent: number, cantidad: number): number {
    return redondear(costoUnitCent * redondearCantidad(cantidad))
  }

  /** Recepción parcial contra una orden. Cada línea se limita a su pendiente. */
  function registrarRecepcion(ctx: SessionContext, input: RecepcionInput): { id: number; numero: string; completo: boolean } {
    requirePermission(ctx, 'compras.crear')
    const orden = repo.getDocumento(db, ctx.empresaId, input.ordenId)
    if (!orden || orden.tipo !== 'ORDEN_COMPRA') throw errors.notFound('Orden de compra')
    if (['ANULADO', 'CONVERTIDA'].includes(String(orden.estado))) {
      throw errors.conflict('La orden no permite nuevas recepciones en su estado actual.')
    }
    const almacenId = almacenPorDefecto(ctx, input.almacenId)
    const fecha = hoy()
    const porLinea = new Map(input.lineas.map((l) => [Number(l.docLineaId), l.cantidad]))

    return db.transaction(() => {
      const ordenLineas = repo.listarLineas(db, ctx.empresaId, Number(orden.id))
      const seleccionadas = ordenLineas.filter((l) => porLinea.has(Number(l.id)))
      if (!seleccionadas.length) throw errors.validation('Indique al menos una línea de la orden.')

      const numero = numerar(ctx.empresaId, 'RECEPCION')
      const docId = repo.insertarDocumento(db, {
        empresaId: ctx.empresaId, tipo: 'RECEPCION', numero,
        numeroProveedor: String(orden.numeroProveedor ?? ''),
        proveedorId: Number(orden.proveedorId), proveedorNombre: String(orden.proveedorNombre),
        proveedorRnc: String(orden.proveedorRnc ?? ''), fecha, vencimiento: '',
        almacenId, condicion: 'CONTADO', estado: 'PARCIAL', usuarioId: ctx.userId,
        docOrigenId: Number(orden.id), comentarios: input.comentarios ?? '',
        motivo: 'Recepción de mercancía'
      })

      const calculadas: LineaCalculada[] = []
      let gastoTotalCent = 0
      let costoTotalCent = 0
      for (const linea of seleccionadas) {
        const cantidad = redondearCantidad(porLinea.get(Number(linea.id)) ?? 0)
        if (cantidad <= 0) throw errors.validation('La cantidad recibida debe ser mayor que cero.')
        const disponible = pendiente(linea)
        if (cantidad - disponible > EPS) {
          throw errors.conflict(`La cantidad recibida excede el pendiente de ${linea.descripcion}.`)
        }
        const producto = repo.getProducto(db, ctx.empresaId, Number(linea.productoId))
        if (!producto) throw errors.notFound('Producto')
        const calculo = calcularLinea({
          cantidad, precioCent: Number(linea.precioCent),
          descuentoPctBp: Number(linea.descuentoPctBp ?? 0),
          descuentoCent: Number(linea.descuentoCent ?? 0),
          tasaBp: Number(linea.tasaBp ?? 0), exento: Boolean(linea.exento)
        })
        const gastoCent = gastoProporcional(cantidad, Number(linea.cantidad), Number(linea.gastoCent ?? 0))
        const lineaId = repo.insertarLinea(db, {
          empresaId: ctx.empresaId, docId, productoId: Number(linea.productoId),
          descripcion: String(linea.descripcion), cantidad, cantidadRecibida: cantidad,
          precioCent: Number(linea.precioCent), descuentoPctBp: Number(linea.descuentoPctBp ?? 0),
          descuentoCent: Number(linea.descuentoCent ?? 0), gastoCent,
          impuestoId: linea.impuestoId ? Number(linea.impuestoId) : null,
          impuestoCodigo: String(linea.impuestoCodigo ?? ''), tasaBp: Number(linea.tasaBp ?? 0),
          exento: Boolean(linea.exento), impuestoCent: calculo.impuestoCent,
          subtotalCent: calculo.subtotalCent, totalCent: calculo.totalCent + gastoCent,
          costoUnitCent: Number(linea.costoUnitCent),
          numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? '')
        })
        const movimiento = inventario.movimientoDocumento(ctx, {
          tipo: 'COMPRA', productoId: Number(linea.productoId), almacenId, cantidad,
          costoUnitCent: Number(linea.costoUnitCent), docTipo: 'RECEPCION', docId,
          docLineaId: lineaId, motivo: 'Recepción de compra', referencia: numero
        })
        registrarSerieYLoteEntrada(ctx.empresaId, producto, {
          productoId: Number(linea.productoId), cantidad,
          numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? '')
        }, almacenId, docId, 'RECEPCION')
        repo.incrementarRecibido(db, ctx.empresaId, Number(linea.id), cantidad)
        calculadas.push(calculo)
        gastoTotalCent += gastoCent
        costoTotalCent += Math.abs(movimiento.costoTotalCent)
      }

      const resumen = resumenLineas(calculadas)
      repo.actualizarTotales(db, ctx.empresaId, docId, {
        subtotalCent: resumen.subtotalCent, descuentoCent: resumen.descuentoCent,
        impuestoCent: resumen.impuestoCent, gastoCent: gastoTotalCent,
        totalCent: resumen.totalCent + gastoTotalCent, costoTotalCent
      })
      const completo = repo.listarLineas(db, ctx.empresaId, Number(orden.id))
        .every((l) => pendiente(l) <= EPS)
      repo.setEstadoDocumento(db, ctx.empresaId, docId, completo ? 'COMPLETO' : 'PARCIAL')
      if (completo) repo.setEstadoDocumento(db, ctx.empresaId, Number(orden.id), 'COMPLETO')
      else if (orden.estado === 'PENDIENTE') repo.setEstadoDocumento(db, ctx.empresaId, Number(orden.id), 'PARCIAL')
      audit(ctx, 'CREAR', 'documentos_compra', docId, null, {
        numero, ordenId: Number(orden.id), completo, totalCent: resumen.totalCent + gastoTotalCent
      })
      return { id: docId, numero, completo }
    })()
  }

  function anular(ctx: SessionContext, input: AnularCompraInput): { id: number; devolucionId: number | null } {
    const motivo = input.motivo ?? 'Anulación solicitada'
    const doc = repo.getDocumento(db, ctx.empresaId, input.id)
    if (!doc) throw errors.notFound('Documento de compra')
    requirePermission(ctx, 'compras.anular')
    if (doc.estado === 'ANULADO') throw errors.conflict('El documento ya está anulado.')
    if (doc.tipo === 'DEVOLUCION_COMPRA') {
      throw errors.conflict('Las devoluciones no se anulan; registre una compra para corregir el inventario.')
    }
    const hijos = db.prepare(`
      SELECT id FROM documentos_compra
      WHERE empresa_id = ? AND doc_origen_id = ? AND estado <> 'ANULADO'
    `).all(ctx.empresaId, doc.id) as { id: number }[]
    if (hijos.length) throw errors.conflict('El documento tiene hijos activos; anule primero esos documentos.')

    return db.transaction(() => {
      let devolucionId: number | null = null
      if (['RECEPCION', 'FACTURA_COMPRA'].includes(String(doc.tipo))) {
        // Solo se revierte el stock que este documento movió realmente. Una factura
        // contra recepción no genera kardex propio y, por tanto, no genera devolución.
        const movimientos = movimientosPorLinea(String(doc.tipo), Number(doc.id), ctx.empresaId)
        const items = repo.listarLineas(db, ctx.empresaId, Number(doc.id))
          .filter((l) => movimientos.has(Number(l.id)))
          .map((l) => ({
            docLineaId: Number(l.id),
            cantidad: redondearCantidad(Number(l.cantidadRecibida ?? 0) - Number(l.cantidadDevuelta ?? 0))
          }))
          .filter((l) => l.cantidad > EPS)
        if (items.length) {
          const devolucion = crearDevolucionInterna(ctx, doc, items, motivo, false)
          devolucionId = devolucion.id
        }
      }

      if (doc.tipo === 'FACTURA_COMPRA') {
        const cxpDocumento = cxp.getCxpPorDocumento(db, ctx.empresaId, Number(doc.id))
        if (cxpDocumento && cxpDocumento.estado !== 'ANULADO') {
          cxp.anularCxp(db, ctx.empresaId, Number(doc.id))
          if (Number(doc.totalCent) > 0) {
            cxp.movimientoCxp(db, {
              empresaId: ctx.empresaId, proveedorId: Number(doc.proveedorId),
              cxpDocumentoId: Number(cxpDocumento.id), docCompraId: Number(doc.id),
              tipo: 'ANULACION', montoCent: Number(doc.totalCent),
              referencia: motivo, usuarioId: ctx.userId
            })
            cxp.ajustarBalanceProveedor(db, ctx.empresaId, Number(doc.proveedorId), -Number(doc.totalCent))
          }
        }
        reversarPagosEfectivo(ctx, Number(doc.id), motivo, 'DEVOLUCION_COMPRA', devolucionId)
      }

      if (doc.docOrigenId) {
        const padreId = Number(doc.docOrigenId)
        if (doc.tipo === 'RECEPCION') {
          for (const linea of repo.listarLineas(db, ctx.empresaId, Number(doc.id))) {
            if (linea.docLineaId) {
              repo.decrementarRecibido(db, ctx.empresaId, Number(linea.docLineaId), Number(linea.cantidad))
            }
          }
        } else if (doc.tipo === 'FACTURA_COMPRA') {
          const padre = repo.getDocumento(db, ctx.empresaId, padreId)
          if (padre?.tipo === 'ORDEN_COMPRA') {
            for (const linea of repo.listarLineas(db, ctx.empresaId, Number(doc.id))) {
              if (linea.docLineaId) {
                repo.decrementarRecibido(db, ctx.empresaId, Number(linea.docLineaId), Number(linea.cantidad))
              }
            }
          }
        }
        const padre = repo.getDocumento(db, ctx.empresaId, padreId)
        if (padre && padre.estado !== 'ANULADO') {
          const lineasPadre = repo.listarLineas(db, ctx.empresaId, padreId)
          const completo = lineasPadre.length > 0 && lineasPadre.every((l) => pendiente(l) <= EPS)
          const parcial = lineasPadre.some((l) => Number(l.cantidadRecibida ?? 0) > EPS)
          const estadoPadre = padre.tipo === 'RECEPCION'
            ? (completo ? 'COMPLETO' : 'PARCIAL')
            : (parcial ? 'PARCIAL' : 'PENDIENTE')
          repo.setEstadoDocumento(db, ctx.empresaId, padreId, estadoPadre)
        }
      }

      repo.setEstadoDocumento(db, ctx.empresaId, Number(doc.id), 'ANULADO')
      audit(ctx, 'ANULAR', 'documentos_compra', Number(doc.id), { estado: doc.estado }, { estado: 'ANULADO', motivo })
      return { id: Number(doc.id), devolucionId }
    })()
  }

  function convertir(ctx: SessionContext, input: ConvertirCompraInput) {
    requirePermission(ctx, 'compras.crear')
    const origen = repo.getDocumento(db, ctx.empresaId, input.id)
    if (!origen) throw errors.notFound('Documento de origen')
    if (['ANULADO', 'CONVERTIDA'].includes(String(origen.estado))) {
      throw errors.conflict('El documento ya fue convertido o anulado.')
    }

    if (input.tipoDestino === 'ORDEN_COMPRA') {
      if (origen.tipo !== 'SOLICITUD_COMPRA') {
        throw errors.validation('Solo una solicitud puede convertirse en orden de compra.')
      }
      const lineas = repo.listarLineas(db, ctx.empresaId, Number(origen.id)).map((l) => lineaDesdeFila(l, Number(l.cantidad)))
      const destino = crearDocumento(ctx, {
        tipo: 'ORDEN_COMPRA', proveedorId: Number(origen.proveedorId),
        almacenId: input.almacenId, numeroProveedor: String(origen.numeroProveedor ?? ''),
        comentarios: input.comentarios ?? '', motivo: `Convertido de ${origen.numero}`,
        docOrigenId: Number(origen.id), lineas
      })
      repo.setEstadoDocumento(db, ctx.empresaId, Number(origen.id), 'CONVERTIDA')
      audit(ctx, 'MODIFICAR', 'documentos_compra', Number(origen.id), { estado: origen.estado }, { estado: 'CONVERTIDA', destino: destino.id })
      return destino
    }

    if (!['ORDEN_COMPRA', 'RECEPCION'].includes(String(origen.tipo))) {
      throw errors.validation('Solo una orden o una recepción puede convertirse en factura.')
    }
    const destino = crearDocumento(ctx, {
      tipo: 'FACTURA_COMPRA', proveedorId: Number(origen.proveedorId),
      almacenId: input.almacenId, numeroProveedor: String(origen.numeroProveedor ?? ''),
      comentarios: input.comentarios ?? '', motivo: `Convertido de ${origen.numero}`,
      docOrigenId: Number(origen.id), credito: input.credito, pagos: input.pagos,
      lineas: []
    })
    // La factura ya marcó el origen como CONVERTIDA dentro de su transacción.
    audit(ctx, 'MODIFICAR', 'documentos_compra', Number(origen.id), { estado: origen.estado }, { estado: 'CONVERTIDA', destino: destino.id })
    return destino
  }

  return {
    crearDocumento,
    registrarRecepcion,

    solicitud(ctx: SessionContext, input: DocumentoCompraInput) {
      return crearDocumento(ctx, { ...input, tipo: 'SOLICITUD_COMPRA' })
    },

    orden(ctx: SessionContext, input: DocumentoCompraInput) {
      return crearDocumento(ctx, { ...input, tipo: 'ORDEN_COMPRA' })
    },

    factura(ctx: SessionContext, input: DocumentoCompraInput) {
      return crearDocumento(ctx, { ...input, tipo: 'FACTURA_COMPRA' })
    },

    devolucion(ctx: SessionContext, input: DocumentoCompraInput) {
      requirePermission(ctx, 'compras.devolucion')
      if (!input.docOrigenId) throw errors.validation('La devolución requiere un documento de origen.')
      return crearDocumento(ctx, { ...input, tipo: 'DEVOLUCION_COMPRA' })
    },

    convertir,
    anular,

    aprobar(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'compras.aprobar')
      const doc = repo.getDocumento(db, ctx.empresaId, id)
      if (!doc || !['SOLICITUD_COMPRA', 'ORDEN_COMPRA'].includes(String(doc.tipo))) {
        throw errors.notFound('Solicitud u orden de compra')
      }
      if (doc.estado === 'ANULADO') throw errors.conflict('El documento está anulado.')
      repo.setEstadoDocumento(db, ctx.empresaId, id, 'APROBADA')
      audit(ctx, 'MODIFICAR', 'documentos_compra', id, { estado: doc.estado }, { estado: 'APROBADA' })
      return { id }
    },

    documentos(ctx: SessionContext, filtro: DocumentosFiltroCompraInput) {
      requirePermission(ctx, 'compras.consultar')
      return repo.listarDocumentos(db, ctx.empresaId, filtro)
    },

    detalle(ctx: SessionContext, id: number) {
      requirePermission(ctx, 'compras.consultar')
      const cabecera = repo.getDocumento(db, ctx.empresaId, id)
      if (!cabecera) throw errors.notFound('Documento de compra')
      const lineas = repo.listarLineas(db, ctx.empresaId, id)
      const pagos = repo.listarPagos(db, ctx.empresaId, id)
      if (!tiene(ctx, 'compras.costo')) {
        for (const linea of lineas) delete linea.costoUnitCent
        delete cabecera.costoTotalCent
      }
      return { cabecera, lineas, pagos }
    },

    cabeceras(ctx: SessionContext, tipo: string) {
      requirePermission(ctx, 'compras.consultar')
      return repo.listarDocumentos(db, ctx.empresaId, {
        tipo: tipo as DocumentosFiltroCompraInput['tipo'], limite: 300
      })
    },

    catalogos(ctx: SessionContext) {
      requirePermission(ctx, 'compras.consultar')
      const maestros = (sql: string, permitido: boolean): Record<string, unknown>[] =>
        permitido ? (db.prepare(sql).all(ctx.empresaId) as Record<string, unknown>[]) : []
      return {
        proveedores: maestros(`
          SELECT id, codigo, nombre_comercial AS nombreComercial, rnc,
                 condicion_pago_dias AS condicionPagoDias, balance_cent AS balanceCent
          FROM proveedores WHERE empresa_id = ? AND activo = 1 ORDER BY nombre_comercial
        `, tiene(ctx, 'proveedores.consultar')),
        productos: maestros(`
          SELECT id, codigo, descripcion, impuesto_id AS impuestoId, tipo,
                 maneja_serie AS manejaSerie, maneja_lote AS manejaLote,
                 costo_promedio_cent AS costoPromedioCent,
                 costo_ultima_compra_cent AS costoUltimaCompraCent
          FROM productos WHERE empresa_id = ? AND activo = 1 ORDER BY descripcion
        `, tiene(ctx, 'productos.consultar')),
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

    datosImpresion(ctx: SessionContext, input: ImprimirCompraInput) {
      requirePermission(ctx, 'compras.imprimir')
      const doc = repo.getDocumento(db, ctx.empresaId, input.id)
      if (!doc) throw errors.notFound('Documento de compra')
      return {
        formato: input.formato ?? 'CARTA',
        empresa: camel(getEmpresa(db, ctx.empresaId)) ?? {},
        documento: doc,
        lineas: repo.listarLineas(db, ctx.empresaId, Number(doc.id)),
        pagos: repo.listarPagos(db, ctx.empresaId, Number(doc.id))
      }
    },

    async exportar(ctx: SessionContext, filtro: DocumentosFiltroCompraInput) {
      requirePermission(ctx, 'compras.exportar')
      const filas = repo.listarDocumentos(db, ctx.empresaId, filtro)
      const columnas = [
        { header: 'Tipo', key: 'tipo' }, { header: 'Número', key: 'numero' },
        { header: 'Factura/NCF proveedor', key: 'numeroProveedor' },
        { header: 'Fecha', key: 'fecha' }, { header: 'Proveedor', key: 'proveedorNombre' },
        { header: 'RNC', key: 'proveedorRnc' }, { header: 'Estado', key: 'estado' },
        { header: 'Subtotal', key: 'subtotal' }, { header: 'Descuento', key: 'descuento' },
        { header: 'ITBIS', key: 'impuesto' }, { header: 'Gastos', key: 'gasto' },
        { header: 'Total', key: 'total' }
      ]
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Compras')
      ws.columns = columnas.map((c) => ({ ...c, width: Math.max(14, c.header.length + 3) }))
      ws.getRow(1).font = { bold: true }
      for (const fila of filas) {
        ws.addRow({
          ...fila,
          subtotal: Number(fila.subtotalCent ?? 0) / 100,
          descuento: Number(fila.descuentoCent ?? 0) / 100,
          impuesto: Number(fila.impuestoCent ?? 0) / 100,
          gasto: Number(fila.gastoCent ?? 0) / 100,
          total: Number(fila.totalCent ?? 0) / 100
        })
      }
      const buffer = await wb.xlsx.writeBuffer()
      return { filename: `compras_${hoy()}.xlsx`, base64: Buffer.from(buffer).toString('base64') }
    }
  }
}

import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { createAjustesService } from './ajustes.service'
import { errors } from '@shared/errors'
import { writeAudit } from '../repositories/auditoria.repo'
import { camel } from '../repositories/ventas.repo'
import { getEmpresa, getSerie, nextSerieNumber } from '../repositories/configuracion.repo'
import * as repo from '../repositories/compras.repo'
import * as aux from '../repositories/auxiliares.repo'
import * as cxp from '../repositories/cxp.repo'
import * as contab from '../repositories/contabilidad.repo'
import {
  calcularLinea, resumenLineas,
  type ImpuestoAgrupado, type LineaCalculada
} from '../core/impuestos'
import { dividirCentavos, multiplicarCentavos, redondear, redondearCantidad } from '../core/dinero'
import {
  ingresoMercanciaSchema, editarIngresoSchema, imprimirCompraSchema, historialIngresoSchema,
  type DocumentoCompraInput, type DocumentosFiltroCompraInput, type RecepcionInput,
  type ConvertirCompraInput, type AnularCompraInput, type ImprimirCompraInput,
  type LineaCompraInput, type PagoCompraInput, type IngresoMercanciaInput,
  type EditarIngresoInput, type HistorialIngresoInput
} from '@shared/schemas/compras'

type InventarioService = ReturnType<typeof import('./inventario.service').createInventarioService>
type Fila = import('../repositories/ventas.repo').Fila
type DatosCrearCompra = DocumentoCompraInput & Partial<Omit<IngresoMercanciaInput, 'tipo'>>

const EPS = 1e-9
/** Solo la factura de compra es un documento final que requiere aprobación en el alta. */
const DOCUMENTOS_CON_APROBACION = new Set(['FACTURA_COMPRA'])

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
export function createComprasService(
  db: Db,
  inventario: InventarioService,
  ajustes: Pick<ReturnType<typeof createAjustesService>, 'leerGrupo'> = createAjustesService(db)
) {
  function audit(ctx: SessionContext, operacion: string, entidad: string, id: number, antes: unknown, despues: unknown): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  function tiene(ctx: SessionContext, permiso: string): boolean {
    return ctx.permisos.includes(permiso)
  }

  /**
   * Aprobación en el momento del alta: no altera el estado ni la contabilización
   * (stock y CxP se registran igual); documenta únicamente la vía de autorización.
   */
  function verificarAprobacion(ctx: SessionContext, tipo: string, totalCent: number, docId: number): void {
    const flujos = ajustes.leerGrupo(ctx.empresaId, 'flujos')
    if (!flujos.comprasRequierenAprobacion || !DOCUMENTOS_CON_APROBACION.has(tipo)) return

    const umbralCent = flujos.autoAprobarHastaCent
    const porUmbral = umbralCent > 0 && totalCent <= umbralCent
    if (!porUmbral) requirePermission(ctx, 'compras.aprobar')

    audit(ctx, 'AUTORIZAR_FLUJO', 'flujos_aprobacion', docId, null, {
      tipo, totalCent, umbralCent,
      via: porUmbral ? 'UMBRAL' : 'PERMISO',
      permiso: porUmbral ? null : 'compras.aprobar'
    })
  }

  function motivoAnulacion(ctx: SessionContext, motivo: string | undefined): string {
    const texto = (motivo ?? '').trim()
    const flujos = ajustes.leerGrupo(ctx.empresaId, 'flujos')
    if (!texto) {
      if (flujos.anulacionRequiereMotivo) throw errors.validation('Indique el motivo de la anulación.')
      return 'Anulación solicitada'
    }
    if (flujos.anulacionRequiereMotivo && texto.length < 3) {
      throw errors.validation('El motivo de la anulación debe tener al menos 3 caracteres.')
    }
    return texto
  }

  /** Moneda base de la empresa, leída de parámetros reales; nunca estimada. */
  function monedaBase(empresaId: number): string {
    const parametro = db.prepare(`
      SELECT valor FROM parametros WHERE empresa_id = ? AND clave = 'moneda_base'
    `).get(empresaId) as { valor?: string } | undefined
    if (parametro?.valor) return parametro.valor.toUpperCase()
    const empresa = db.prepare('SELECT moneda_base FROM empresas WHERE id = ?')
      .get(empresaId) as { moneda_base?: string } | undefined
    return (empresa?.moneda_base ?? 'DOP').toUpperCase()
  }

  /**
   * Resuelve la tasa vigente de `tasas_cambio`. Una tasa distinta de 1 escrita a mano
   * requiere `compras.tasa`; el cambio automático sale de la tabla de tasas reales.
   */
  function resolverMoneda(
    ctx: SessionContext, fecha: string, codigoSolicitado?: string, tasaSolicitada?: number
  ): { codigo: string; tasa: number; extranjera: boolean } {
    const base = monedaBase(ctx.empresaId)
    const codigo = (codigoSolicitado ?? base).toUpperCase()
    const moneda = db.prepare(`
      SELECT codigo FROM monedas WHERE empresa_id = ? AND codigo = ? AND activa = 1
    `).get(ctx.empresaId, codigo) as { codigo: string } | undefined
    if (!moneda) throw errors.notFound('Moneda')
    if (codigo === base) return { codigo, tasa: 1, extranjera: false }

    const manual = tasaSolicitada !== undefined && redondear(tasaSolicitada * 10000) !== 10000
    if (manual) requirePermission(ctx, 'compras.tasa')
    const tasa = manual
      ? Number(tasaSolicitada)
      : Number((db.prepare(`
          SELECT tasa FROM tasas_cambio
          WHERE empresa_id = ? AND moneda_codigo = ? AND date(fecha) <= date(?)
          ORDER BY fecha DESC, id DESC LIMIT 1
        `).get(ctx.empresaId, codigo, fecha) as { tasa?: number } | undefined)?.tasa ?? 0)
    if (!Number.isFinite(tasa) || tasa <= 0) {
      throw errors.conflict(`No hay tasa de cambio vigente para ${codigo} en ${fecha}.`)
    }
    return { codigo, tasa, extranjera: true }
  }

  function validarDescuentos(ctx: SessionContext, lineas: LineaCompraInput[]): void {
    const conDescuento = lineas.some((l) => [
      l.descuentoPctBp, l.descuentoCent, l.descuento2PctBp, l.descuento2Cent,
      l.descuento3PctBp, l.descuento3Cent
    ].some((v) => Number(v ?? 0) !== 0))
    if (conDescuento) requirePermission(ctx, 'compras.descuento')
  }

  function validarDuplicado(
    empresaId: number, tipo: string, numeroProveedor: string | undefined,
    proveedorId: number, excluirId?: number
  ): void {
    if (tipo !== 'FACTURA_COMPRA' || !numeroProveedor?.trim()) return
    if (repo.existeNumeroProveedor(db, empresaId, tipo, numeroProveedor, proveedorId, excluirId)) {
      throw errors.conflict(
        `La factura/NCF ${numeroProveedor.trim()} ya está registrada para este proveedor.`
      )
    }
  }

  /** Reparte un importe entero entre líneas sin perder ni inventar centavos. */
  function prorratear(totalCent: number, pesos: number[]): number[] {
    const suma = pesos.reduce((s, p) => s + Math.max(0, p), 0)
    if (totalCent === 0 || suma <= 0) return pesos.map(() => 0)
    const signo = totalCent < 0 ? -1 : 1
    const importe = Math.abs(totalCent)
    const base = pesos.map((p) => Math.floor(importe * Math.max(0, p) / suma))
    let resto = importe - base.reduce((s, p) => s + p, 0)
    const orden = pesos.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p || a.i - b.i)
    for (let k = 0; resto > 0; k++, resto--) base[orden[k % orden.length].i] += 1
    return base.map((p) => p * signo)
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

  /**
   * Asiento COMPRA en borrador, igual que la integración de ventas: el documento
   * queda vinculado al asiento real y el historial conserva el número generado.
   */
  function contabilizarIngreso(
    ctx: SessionContext, docId: number, datos: {
      numero: string; fecha: string; proveedorNombre: string; totalCent: number
      impuestoCent: number; credito: boolean; metodoPago?: string
      clasificacionContable: string
    }
  ): number {
    const inventarioCuenta = contab.obtenerCuentaPorCodigo(
      db, ctx.empresaId, datos.clasificacionContable || '1200'
    )
    const itbisCuenta = contab.obtenerCuentaPorCodigo(db, ctx.empresaId, '4120')
    const codigoAcreedor = datos.credito ? '2110'
      : (datos.metodoPago === 'EFECTIVO' ? '1110' : '1120')
    const acreedorCuenta = contab.obtenerCuentaPorCodigo(db, ctx.empresaId, codigoAcreedor)
    if (!inventarioCuenta || !itbisCuenta || !acreedorCuenta || !inventarioCuenta.acepta_movimiento) {
      throw errors.validation('El plan de cuentas no tiene las cuentas de compra necesarias.')
    }
    if (datos.totalCent < datos.impuestoCent) {
      throw errors.validation('El total de la compra no puede ser menor que el ITBIS.')
    }

    const anio = Number(datos.fecha.slice(0, 4))
    const mes = Number(datos.fecha.slice(5, 7))
    const periodoId = contab.crearPeriodoSiFalta(db, ctx.empresaId, anio, mes)
    const periodo = contab.obtenerPeriodo(db, ctx.empresaId, periodoId)
    if (periodo && String(periodo.estado) !== 'ABIERTO') {
      throw errors.conflict(`El periodo ${anio}-${String(mes).padStart(2, '0')} está cerrado.`)
    }

    const asiento = contab.insertarAsiento(db, ctx.empresaId, {
      fecha: datos.fecha,
      descripcion: `Compra ${datos.numero} - ${datos.proveedorNombre}`.slice(0, 200),
      tipo: 'COMPRA', periodoId, usuarioId: ctx.userId
    })
    const costoCent = datos.totalCent - datos.impuestoCent
    contab.insertarLineas(db, asiento.id, [
      { cuentaId: Number(inventarioCuenta.id), debeCent: costoCent, haberCent: 0, descripcion: `Mercancía ${datos.numero}` },
      { cuentaId: Number(itbisCuenta.id), debeCent: datos.impuestoCent, haberCent: 0, descripcion: 'ITBIS pagado en compras' },
      { cuentaId: Number(acreedorCuenta.id), debeCent: 0, haberCent: datos.totalCent, descripcion: `Proveedor ${datos.proveedorNombre}` }
    ])
    repo.setAsiento(db, ctx.empresaId, docId, asiento.id)
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, 'INTEGRAR_COMPRA', 'asientos', asiento.id, null, {
      documentoId: docId, numero: datos.numero, totalCent: datos.totalCent,
      impuestoCent: datos.impuestoCent, asiento: asiento.numero
    })
    return asiento.id
  }

  function anularAsiento(ctx: SessionContext, docId: number, motivo: string): void {
    const doc = repo.getDocumento(db, ctx.empresaId, docId)
    const asientoId = Number(doc?.asientoId ?? 0)
    if (!asientoId) return
    const asiento = contab.obtenerAsiento(db, ctx.empresaId, asientoId)
    if (asiento && String(asiento.estado) !== 'ANULADO') {
      contab.actualizarEstadoAsiento(db, ctx.empresaId, asientoId, 'ANULADO')
      writeAudit(db, {
        empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
      }, 'ANULAR_COMPRA', 'asientos', asientoId, { estado: asiento.estado }, {
        estado: 'ANULADO', documentoId: docId, motivo
      })
    }
    repo.setAsiento(db, ctx.empresaId, docId, null)
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
    ctx: SessionContext, input: DatosCrearCompra
  ): { id: number; numero: string; totalCent: number } {
    requirePermission(ctx, input.tipo === 'DEVOLUCION_COMPRA' ? 'compras.devolucion' : 'compras.crear')
    if (input.tipo === 'RECEPCION') {
      throw errors.validation('Use compras.recepcion para registrar la mercancía recibida.')
    }

    const proveedor = repo.getProveedor(db, ctx.empresaId, input.proveedorId)
    if (!proveedor) throw errors.notFound('Proveedor')
    if (input.almacenId) {
      const destino = db.prepare(`
        SELECT principal FROM almacenes WHERE id = ? AND empresa_id = ? AND activo = 1
      `).get(input.almacenId, ctx.empresaId) as { principal: number } | undefined
      if (!destino) throw errors.notFound('Almacén')
      if (!destino.principal) requirePermission(ctx, 'compras.almacen')
    }
    const almacenId = almacenPorDefecto(ctx, input.almacenId)
    const fecha = input.fecha ?? hoy()
    const moneda = resolverMoneda(ctx, fecha, input.monedaCodigo, input.tasaAplicada)
    validarDescuentos(ctx, input.lineas)
    validarDuplicado(ctx.empresaId, input.tipo, input.numeroProveedor, input.proveedorId)
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
        motivo: input.motivo ?? '', comentarios: input.comentarios ?? '',
        nota: input.nota ?? '', fechaLlegada: input.fechaLlegada ?? '',
        numeroOrdenCompra: input.numeroOrdenCompra ?? '',
        clasificacionContable: input.clasificacionContable ?? '1200',
        monedaCodigo: moneda.codigo, tasaAplicada: moneda.tasa,
        montoFacturaMonedaCent: input.montoFacturaMonedaCent ?? 0,
        montoFacturaCent: input.montoFacturaCent ?? 0,
        ajusteCent: input.ajusteCent ?? 0
      })

      const mueveStock = input.tipo === 'FACTURA_COMPRA' && origen?.tipo !== 'RECEPCION'
      const fleteCent = input.fleteCent ?? 0
      const preparadas: {
        linea: LineaCompraInput; producto: Fila; impuesto: Fila | undefined
        exento: boolean; calculo: LineaCalculada; cantidad: number
        gastoPropioCent: number; numeroSerie: string; lote: string
        precioBaseCent: number
      }[] = []

      for (const linea of lineas) {
        const producto = repo.getProducto(db, ctx.empresaId, linea.productoId)
        if (!producto) throw errors.notFound('Producto')
        const precioDocumento = linea.precioCent ?? (
          Number(producto.costoUltimaCompraCent ?? 0) > 0
            ? Number(producto.costoUltimaCompraCent)
            : Number(producto.costoPromedioCent ?? 0)
        )
        if (!precioDocumento && linea.precioCent === undefined) {
          throw errors.validation(`Indique el costo de ${producto.descripcion}.`)
        }
        const precioBaseCent = multiplicarCentavos(precioDocumento, moneda.tasa)
        const impuesto = repo.getImpuesto(
          db, ctx.empresaId,
          linea.impuestoId ?? (producto.impuestoId ? Number(producto.impuestoId) : undefined)
        )
        const exento = Boolean(linea.exento) || Boolean(impuesto?.exento)
        const descuentoCent = linea.descuentoCent === undefined
          ? undefined : multiplicarCentavos(linea.descuentoCent, moneda.tasa)
        const descuento2Cent = linea.descuento2Cent === undefined
          ? undefined : multiplicarCentavos(linea.descuento2Cent, moneda.tasa)
        const descuento3Cent = linea.descuento3Cent === undefined
          ? undefined : multiplicarCentavos(linea.descuento3Cent, moneda.tasa)
        const calculo = calcularLinea({
          cantidad: linea.cantidad, precioCent: precioBaseCent,
          descuentoPctBp: linea.descuentoPctBp ?? 0, descuentoCent,
          descuento2PctBp: linea.descuento2PctBp ?? 0, descuento2Cent,
          descuento3PctBp: linea.descuento3PctBp ?? 0, descuento3Cent,
          tasaBp: Number(impuesto?.tasaBp ?? 0), exento,
          impuestoCodigo: String(impuesto?.codigo ?? '')
        })
        const numeroSerie = linea.numeroSerie ?? ''
        const lote = linea.lote ?? ''
        validarSerieYLote(ctx.empresaId, producto, { ...linea, numeroSerie, lote })
        preparadas.push({
          linea, producto, impuesto, exento, calculo,
          cantidad: redondearCantidad(linea.cantidad),
          gastoPropioCent: linea.gastoCent ?? 0, numeroSerie, lote, precioBaseCent
        })
      }

      const fletePorLinea = prorratear(fleteCent, preparadas.map((p) => p.calculo.baseCent))
      const calculadas: LineaCalculada[] = []
      let gastoTotalCent = 0
      let costoTotalCent = 0

      for (let i = 0; i < preparadas.length; i++) {
        const { linea, producto, impuesto, exento, calculo, cantidad, gastoPropioCent, numeroSerie, lote, precioBaseCent } = preparadas[i]
        const gastoCent = gastoPropioCent + fletePorLinea[i]
        const costoUnitCent = dividirCentavos(calculo.baseCent + gastoCent, cantidad)
        const datosLinea: Omit<repo.LineaNueva, 'empresaId' | 'docId' | 'productoId' | 'descripcion' | 'cantidad' | 'impuestoId' | 'exento'> = {
          cantidadRecibida: mueveStock || origen?.tipo === 'RECEPCION' ? cantidad : 0,
          cantidadDevuelta: 0,
          precioCent: precioBaseCent,
          descuentoPctBp: linea.descuentoPctBp ?? 0,
          descuentoCent: calculo.descuento1Cent,
          descuento2PctBp: linea.descuento2PctBp ?? 0,
          descuento2Cent: calculo.descuento2Cent,
          descuento3PctBp: linea.descuento3PctBp ?? 0,
          descuento3Cent: calculo.descuento3Cent,
          baseCent: calculo.baseCent,
          referencia: linea.referencia ?? '',
          pvsCent: linea.pvsCent === undefined ? 0 : multiplicarCentavos(linea.pvsCent, moneda.tasa),
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
      }

      // El flete y los gastos se capitalizan al costo y se adeudan al proveedor,
      // pero no se gravan dos veces: el ITBIS ya se calculó por línea.
      const resumen = resumenLineas(calculadas)
      const ajusteCent = input.ajusteCent ?? 0
      const totalCent = resumen.totalCent + gastoTotalCent + ajusteCent
      if (totalCent < 0) throw errors.validation('El total de la compra no puede ser negativo.')
      const montoFacturaCent = input.montoFacturaCent ?? totalCent
      const montoFacturaMonedaCent = input.montoFacturaMonedaCent ?? (
        moneda.extranjera ? dividirCentavos(totalCent, moneda.tasa) : totalCent
      )
      repo.actualizarTotales(db, ctx.empresaId, docId, {
        subtotalCent: resumen.subtotalCent,
        descuentoCent: resumen.descuentoCent,
        descuento1Cent: resumen.descuento1Cent,
        descuento2Cent: resumen.descuento2Cent,
        descuentoItemsCent: resumen.descuento3Cent,
        impuestoCent: resumen.impuestoCent,
        gastoCent: gastoTotalCent, fleteCent,
        baseCent: resumen.baseCent, exentoCent: resumen.exentoCent,
        gravadoCent: resumen.gravadoCent,
        totalCent, costoTotalCent,
        montoFacturaCent, diferenciaCent: montoFacturaCent - totalCent,
        motivoDiferencia: input.nota ?? ''
      })
      db.prepare(`
        UPDATE documentos_compra SET monto_factura_moneda_cent = ? WHERE id = ? AND empresa_id = ?
      `).run(montoFacturaMonedaCent, docId, ctx.empresaId)
      repo.insertarImpuestos(db, ctx.empresaId, docId, resumen.impuestosPorTasa as ImpuestoAgrupado[])
      verificarAprobacion(ctx, input.tipo, totalCent, docId)

      if (input.tipo === 'FACTURA_COMPRA') {
        if (credito) {
          registrarCxp(ctx, docId, numero, proveedor, totalCent, fecha, vencimiento)
        } else {
          registrarPagos(ctx, docId, totalCent, input.pagos, false)
        }
        contabilizarIngreso(ctx, docId, {
          numero, fecha, proveedorNombre: String(proveedor.nombreComercial),
          totalCent, impuestoCent: resumen.impuestoCent, credito,
          metodoPago: input.pagos?.[0]?.metodo ?? 'EFECTIVO',
          clasificacionContable: input.clasificacionContable ?? '1200'
        })
        repo.insertarVersion(db, ctx.empresaId, {
          docId, numero, operacion: 'CREAR', antes: null,
          despues: repo.getDocumento(db, ctx.empresaId, docId), usuarioId: ctx.userId
        })
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

  /**
   * Edición real del ingreso directo: revierte kardex, CxP, pagos y asiento anterior
   * dentro de la misma transacción, y vuelve a aplicar la factura corregida.
   */
  function editarIngreso(ctx: SessionContext, entrada: EditarIngresoInput) {
    requirePermission(ctx, 'compras.modificar')
    const input = editarIngresoSchema.parse(entrada)
    const doc = repo.getDocumento(db, ctx.empresaId, input.id)
    if (!doc || doc.tipo !== 'FACTURA_COMPRA') throw errors.notFound('Ingreso de mercancía')
    if (doc.estado === 'ANULADO') throw errors.conflict('El ingreso está anulado; no puede editarse.')
    if (doc.docOrigenId) {
      throw errors.conflict('Este ingreso procede de otro documento; edite el documento de origen.')
    }
    const hijos = db.prepare(`
      SELECT id FROM documentos_compra
      WHERE empresa_id = ? AND doc_origen_id = ? AND estado <> 'ANULADO'
    `).all(ctx.empresaId, doc.id) as { id: number }[]
    if (hijos.length) throw errors.conflict('El ingreso tiene documentos hijos activos.')

    const fecha = input.fecha ?? String(doc.fecha)
    const proveedor = repo.getProveedor(db, ctx.empresaId, input.proveedorId)
    if (!proveedor) throw errors.notFound('Proveedor')
    validarDescuentos(ctx, input.lineas)
    if (input.lineas.some((l) => l.precioCent !== undefined)) requirePermission(ctx, 'compras.costo')
    if (input.almacenId && Number(input.almacenId) !== Number(doc.almacenId)) {
      requirePermission(ctx, 'compras.almacen')
    }
    const almacenId = almacenPorDefecto(ctx, input.almacenId ?? (doc.almacenId ? Number(doc.almacenId) : undefined))
    const moneda = resolverMoneda(ctx, fecha, input.monedaCodigo ?? String(doc.monedaCodigo), input.tasaAplicada)
    if (moneda.codigo !== doc.monedaCodigo || moneda.tasa !== doc.tasaAplicada) {
      requirePermission(ctx, 'compras.tasa')
    }
    validarDuplicado(ctx.empresaId, 'FACTURA_COMPRA', input.numeroProveedor, input.proveedorId, input.id)

    return db.transaction(() => {
      const antes = {
        cabecera: doc,
        lineas: repo.listarLineas(db, ctx.empresaId, Number(doc.id)),
        impuestos: repo.listarImpuestos(db, ctx.empresaId, Number(doc.id)),
        pagos: repo.listarPagos(db, ctx.empresaId, Number(doc.id))
      }
      const movimientos = movimientosPorLinea('FACTURA_COMPRA', Number(doc.id), ctx.empresaId)
      for (const linea of antes.lineas) {
        const cantidad = redondearCantidad(
          Number(linea.cantidadRecibida ?? 0) - Number(linea.cantidadDevuelta ?? 0)
        )
        const movimiento = movimientos.get(Number(linea.id))
        if (cantidad <= EPS || !movimiento) continue
        const producto = repo.getProducto(db, ctx.empresaId, Number(linea.productoId))
        if (!producto) throw errors.notFound('Producto')
        inventario.movimientoDocumento(ctx, {
          tipo: 'DEV_COMPRA', productoId: Number(linea.productoId),
          almacenId: Number(doc.almacenId), cantidad: -cantidad,
          costoUnitCent: Number(movimiento.costoUnitCent),
          docTipo: 'FACTURA_COMPRA', docId: Number(doc.id), docLineaId: Number(linea.id),
          motivo: input.motivo, referencia: String(doc.numero), recalcular: false
        })
        registrarSerieYLoteSalida(ctx.empresaId, producto, {
          numeroSerie: String(linea.numeroSerie ?? ''), lote: String(linea.lote ?? ''), cantidad
        }, Number(doc.almacenId), Number(doc.id), 'FACTURA_COMPRA')
      }

      const cxpDocumento = cxp.getCxpPorDocumento(db, ctx.empresaId, Number(doc.id))
      if (cxpDocumento && cxpDocumento.estado !== 'ANULADO') {
        const saldoCent = Number(cxpDocumento.saldoCent ?? 0)
        cxp.anularCxp(db, ctx.empresaId, Number(doc.id))
        if (saldoCent > 0) {
          cxp.movimientoCxp(db, {
            empresaId: ctx.empresaId, proveedorId: Number(doc.proveedorId),
            cxpDocumentoId: Number(cxpDocumento.id), docCompraId: Number(doc.id),
            tipo: 'ANULACION', montoCent: saldoCent,
            referencia: `Edición ${input.motivo}`, usuarioId: ctx.userId
          })
          cxp.ajustarBalanceProveedor(db, ctx.empresaId, Number(doc.proveedorId), -saldoCent)
        }
      }
      reversarPagosEfectivo(ctx, Number(doc.id), input.motivo, 'FACTURA_COMPRA', Number(doc.id))
      repo.eliminarPagos(db, ctx.empresaId, Number(doc.id))
      repo.eliminarImpuestos(db, ctx.empresaId, Number(doc.id))
      repo.eliminarLineas(db, ctx.empresaId, Number(doc.id))
      anularAsiento(ctx, Number(doc.id), input.motivo)

      const credito = Boolean(input.credito)
      const vencimiento = credito
        ? (input.vencimiento ?? sumarDias(fecha, Number(proveedor.condicionPagoDias ?? 0)))
        : ''
      repo.actualizarIngreso(db, ctx.empresaId, Number(doc.id), {
        proveedorId: Number(proveedor.id),
        proveedorNombre: String(proveedor.nombreComercial),
        proveedorRnc: String(proveedor.rnc ?? ''),
        almacenId: Number(almacenId), fecha,
        fechaLlegada: input.fechaLlegada ?? '', vencimiento,
        numeroProveedor: input.numeroProveedor ?? '',
        numeroOrdenCompra: input.numeroOrdenCompra ?? '',
        clasificacionContable: input.clasificacionContable ?? '1200',
        monedaCodigo: moneda.codigo, tasaAplicada: moneda.tasa,
        montoFacturaMonedaCent: input.montoFacturaMonedaCent ?? 0,
        ajusteCent: input.ajusteCent ?? 0,
        comentarios: input.comentarios ?? '', nota: input.nota ?? '',
        condicion: credito ? 'CREDITO' : 'CONTADO'
      })

      const fleteCent = input.fleteCent ?? 0
      const preparadas: {
        linea: LineaCompraInput; producto: Fila; impuesto: Fila | undefined
        exento: boolean; calculo: LineaCalculada; cantidad: number
        gastoPropioCent: number; numeroSerie: string; lote: string
        precioBaseCent: number
      }[] = []
      for (const linea of input.lineas) {
        const producto = repo.getProducto(db, ctx.empresaId, linea.productoId)
        if (!producto) throw errors.notFound('Producto')
        const precioDocumento = linea.precioCent ?? (
          Number(producto.costoUltimaCompraCent ?? 0) > 0
            ? Number(producto.costoUltimaCompraCent)
            : Number(producto.costoPromedioCent ?? 0)
        )
        if (!precioDocumento && linea.precioCent === undefined) {
          throw errors.validation(`Indique el costo de ${producto.descripcion}.`)
        }
        const precioBaseCent = multiplicarCentavos(precioDocumento, moneda.tasa)
        const impuesto = repo.getImpuesto(
          db, ctx.empresaId,
          linea.impuestoId ?? (producto.impuestoId ? Number(producto.impuestoId) : undefined)
        )
        const exento = Boolean(linea.exento) || Boolean(impuesto?.exento)
        const fijo = (valor?: number) => valor === undefined ? undefined : multiplicarCentavos(valor, moneda.tasa)
        const calculo = calcularLinea({
          cantidad: linea.cantidad, precioCent: precioBaseCent,
          descuentoPctBp: linea.descuentoPctBp ?? 0, descuentoCent: fijo(linea.descuentoCent),
          descuento2PctBp: linea.descuento2PctBp ?? 0, descuento2Cent: fijo(linea.descuento2Cent),
          descuento3PctBp: linea.descuento3PctBp ?? 0, descuento3Cent: fijo(linea.descuento3Cent),
          tasaBp: Number(impuesto?.tasaBp ?? 0), exento,
          impuestoCodigo: String(impuesto?.codigo ?? '')
        })
        const numeroSerie = linea.numeroSerie ?? ''
        const lote = linea.lote ?? ''
        validarSerieYLote(ctx.empresaId, producto, { ...linea, numeroSerie, lote })
        preparadas.push({
          linea, producto, impuesto, exento, calculo,
          cantidad: redondearCantidad(linea.cantidad),
          gastoPropioCent: linea.gastoCent ?? 0, numeroSerie, lote, precioBaseCent
        })
      }

      const fletePorLinea = prorratear(fleteCent, preparadas.map((p) => p.calculo.baseCent))
      const calculadas: LineaCalculada[] = []
      let gastoTotalCent = 0
      let costoTotalCent = 0
      for (let i = 0; i < preparadas.length; i++) {
        const p = preparadas[i]
        const gastoCent = p.gastoPropioCent + fletePorLinea[i]
        const costoUnitCent = dividirCentavos(p.calculo.baseCent + gastoCent, p.cantidad)
        const lineaId = repo.insertarLinea(db, {
          empresaId: ctx.empresaId, docId: Number(doc.id),
          productoId: Number(p.producto.id),
          descripcion: p.linea.descripcion || String(p.producto.descripcion),
          cantidad: p.cantidad, cantidadRecibida: p.cantidad, cantidadDevuelta: 0,
          precioCent: p.precioBaseCent,
          descuentoPctBp: p.linea.descuentoPctBp ?? 0,
          descuentoCent: p.calculo.descuento1Cent,
          descuento2PctBp: p.linea.descuento2PctBp ?? 0,
          descuento2Cent: p.calculo.descuento2Cent,
          descuento3PctBp: p.linea.descuento3PctBp ?? 0,
          descuento3Cent: p.calculo.descuento3Cent,
          baseCent: p.calculo.baseCent,
          referencia: p.linea.referencia ?? '',
          pvsCent: p.linea.pvsCent === undefined ? 0 : multiplicarCentavos(p.linea.pvsCent, moneda.tasa),
          gastoCent, impuestoId: p.impuesto ? Number(p.impuesto.id) : null,
          impuestoCodigo: String(p.impuesto?.codigo ?? ''),
          tasaBp: p.exento ? 0 : Number(p.impuesto?.tasaBp ?? 0), exento: p.exento,
          impuestoCent: p.calculo.impuestoCent, subtotalCent: p.calculo.subtotalCent,
          totalCent: p.calculo.totalCent + gastoCent, costoUnitCent,
          numeroSerie: p.numeroSerie, lote: p.lote
        })
        const movimiento = inventario.movimientoDocumento(ctx, {
          tipo: 'COMPRA', productoId: Number(p.producto.id),
          almacenId: Number(almacenId), cantidad: p.cantidad, costoUnitCent,
          docTipo: 'FACTURA_COMPRA', docId: Number(doc.id), docLineaId: lineaId,
          motivo: input.motivo, referencia: String(doc.numero)
        })
        registrarSerieYLoteEntrada(ctx.empresaId, p.producto, {
          ...p.linea, numeroSerie: p.numeroSerie, lote: p.lote
        }, Number(almacenId), Number(doc.id), 'FACTURA_COMPRA')
        calculadas.push(p.calculo)
        gastoTotalCent += gastoCent
        costoTotalCent += Math.abs(movimiento.costoTotalCent)
      }

      const resumen = resumenLineas(calculadas)
      const ajusteCent = input.ajusteCent ?? 0
      const totalCent = resumen.totalCent + gastoTotalCent + ajusteCent
      if (totalCent < 0) throw errors.validation('El total de la compra no puede ser negativo.')
      const montoFacturaCent = input.montoFacturaCent ?? totalCent
      const montoFacturaMonedaCent = input.montoFacturaMonedaCent ?? (
        moneda.extranjera ? dividirCentavos(totalCent, moneda.tasa) : totalCent
      )
      repo.actualizarTotales(db, ctx.empresaId, Number(doc.id), {
        subtotalCent: resumen.subtotalCent, descuentoCent: resumen.descuentoCent,
        descuento1Cent: resumen.descuento1Cent, descuento2Cent: resumen.descuento2Cent,
        descuentoItemsCent: resumen.descuento3Cent,
        impuestoCent: resumen.impuestoCent, gastoCent: gastoTotalCent, fleteCent,
        baseCent: resumen.baseCent, exentoCent: resumen.exentoCent,
        gravadoCent: resumen.gravadoCent, totalCent, costoTotalCent,
        montoFacturaCent, diferenciaCent: montoFacturaCent - totalCent,
        motivoDiferencia: input.nota ?? ''
      })
      db.prepare(`
        UPDATE documentos_compra SET monto_factura_moneda_cent = ? WHERE id = ? AND empresa_id = ?
      `).run(montoFacturaMonedaCent, doc.id, ctx.empresaId)
      repo.insertarImpuestos(db, ctx.empresaId, Number(doc.id), resumen.impuestosPorTasa as ImpuestoAgrupado[])

      if (credito) {
        registrarCxp(ctx, Number(doc.id), String(doc.numero), proveedor, totalCent, fecha, vencimiento)
      } else {
        registrarPagos(ctx, Number(doc.id), totalCent, input.pagos, false)
      }
      contabilizarIngreso(ctx, Number(doc.id), {
        numero: String(doc.numero), fecha, proveedorNombre: String(proveedor.nombreComercial),
        totalCent, impuestoCent: resumen.impuestoCent, credito,
        metodoPago: input.pagos?.[0]?.metodo ?? 'EFECTIVO',
        clasificacionContable: input.clasificacionContable ?? '1200'
      })
      repo.insertarVersion(db, ctx.empresaId, {
        docId: Number(doc.id), numero: String(doc.numero), operacion: 'MODIFICAR',
        antes, despues: {
          cabecera: repo.getDocumento(db, ctx.empresaId, Number(doc.id)),
          lineas: repo.listarLineas(db, ctx.empresaId, Number(doc.id)),
          impuestos: repo.listarImpuestos(db, ctx.empresaId, Number(doc.id))
        },
        motivo: input.motivo, usuarioId: ctx.userId
      })
      audit(ctx, 'MODIFICAR', 'documentos_compra', Number(doc.id), antes, {
        motivo: input.motivo, totalCent
      })
      return { id: Number(doc.id), numero: String(doc.numero), totalCent }
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
    const motivo = motivoAnulacion(ctx, input.motivo)
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

      anularAsiento(ctx, Number(doc.id), motivo)
      repo.setEstadoDocumento(db, ctx.empresaId, Number(doc.id), 'ANULADO')
      repo.insertarVersion(db, ctx.empresaId, {
        docId: Number(doc.id), numero: String(doc.numero), operacion: 'ANULAR',
        antes: { estado: doc.estado, totalCent: doc.totalCent },
        despues: { estado: 'ANULADO', motivo }, usuarioId: ctx.userId
      })
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

    /** Ingreso de mercancía: contrato estricto con totalización y campos ERP. */
    ingreso(ctx: SessionContext, entrada: IngresoMercanciaInput) {
      const input = ingresoMercanciaSchema.parse({ ...entrada, tipo: 'FACTURA_COMPRA' })
      return crearDocumento(ctx, input)
    },

    editarIngreso,

    historial(ctx: SessionContext, entrada?: HistorialIngresoInput) {
      requirePermission(ctx, 'compras.historial')
      const filtro = historialIngresoSchema.parse(entrada ?? {})
      const documentos = repo.listarDocumentos(db, ctx.empresaId, filtro)
      const ids = new Set(documentos.map((d) => Number(d.id)))
      const porDocumento = <T extends { docId?: unknown }>(filas: T[]): T[] =>
        filas.filter((f) => ids.has(Number(f.docId)))
      const asientos = documentos
        .filter((d) => d.asientoId)
        .map((d) => contab.obtenerAsiento(db, ctx.empresaId, Number(d.asientoId)))
        .filter((a): a is Fila => Boolean(a))
      return {
        documentos,
        versiones: porDocumento(repo.listarVersiones(db, ctx.empresaId)),
        reimpresiones: porDocumento(repo.listarReimpresiones(db, ctx.empresaId)),
        auditoria: repo.listarAuditoriaDocumento(db, ctx.empresaId)
          .filter((a) => ids.has(Number(a.entidadId))),
        asientos
      }
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
      const impuestos = repo.listarImpuestos(db, ctx.empresaId, id)
      const pagos = repo.listarPagos(db, ctx.empresaId, id)
      if (!tiene(ctx, 'compras.costo')) {
        for (const linea of lineas) delete linea.costoUnitCent
        delete cabecera.costoTotalCent
      }
      return { cabecera, lineas, impuestos, pagos }
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
          SELECT id, codigo, descripcion, referencia, precio1_cent AS precio1Cent, impuesto_id AS impuestoId, tipo,
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
        `).get(ctx.empresaId) as { valor?: string } | undefined)?.valor ?? 'ITBIS18'),
        monedaBase: monedaBase(ctx.empresaId),
        monedas: db.prepare(`
          SELECT codigo, nombre, simbolo, decimales FROM monedas
          WHERE empresa_id = ? AND activa = 1 ORDER BY codigo
        `).all(ctx.empresaId) as Record<string, unknown>[],
        clasificacionesContables: db.prepare(`
          SELECT codigo, nombre FROM plan_cuentas
          WHERE empresa_id = ? AND activa = 1 AND acepta_movimiento = 1
          ORDER BY codigo
        `).all(ctx.empresaId) as Record<string, unknown>[],
        tasasCambio: db.prepare(`
          SELECT moneda_codigo AS monedaCodigo, tasa, fecha FROM tasas_cambio
          WHERE empresa_id = ? ORDER BY fecha DESC, id DESC LIMIT 300
        `).all(ctx.empresaId) as Record<string, unknown>[]
      }
    },

    datosImpresion(ctx: SessionContext, entrada: ImprimirCompraInput) {
      requirePermission(ctx, 'compras.imprimir')
      const input = imprimirCompraSchema.parse(entrada)
      const doc = repo.getDocumento(db, ctx.empresaId, input.id)
      if (!doc) throw errors.notFound('Documento de compra')
      db.transaction(() => {
        repo.insertarReimpresion(db, ctx.empresaId, {
          docId: Number(doc.id), formato: input.formato,
          motivo: input.motivo, usuarioId: ctx.userId, sesionId: ctx.sesionId
        })
        repo.insertarVersion(db, ctx.empresaId, {
          docId: Number(doc.id), numero: String(doc.numero), operacion: 'IMPRIMIR',
          antes: null, despues: { formato: input.formato, motivo: input.motivo },
          motivo: input.motivo, usuarioId: ctx.userId
        })
      })()
      return {
        formato: input.formato,
        empresa: camel(getEmpresa(db, ctx.empresaId)) ?? {},
        documento: doc,
        lineas: repo.listarLineas(db, ctx.empresaId, Number(doc.id)),
        impuestos: repo.listarImpuestos(db, ctx.empresaId, Number(doc.id)),
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

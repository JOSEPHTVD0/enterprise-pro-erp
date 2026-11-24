import type { Db } from '../db/connection'
import type { DocumentosFiltroCompraInput } from '@shared/schemas/compras'
import { camel, type Fila } from './ventas.repo'

/** Persistencia de Fase 7. Todos los importes se guardan como enteros en centavos. */
const camelList = (rows: Fila[]): Fila[] => rows.map((r) => camel(r) as Fila)

export { getImpuesto } from './ventas.repo'

export function getProveedor(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, codigo, nombre_comercial, razon_social, rnc, condicion_pago_dias, balance_cent
    FROM proveedores WHERE id = ? AND empresa_id = ? AND activo = 1
  `).get(id, empresaId) as Fila | undefined)
}

export function getProducto(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, descripcion, impuesto_id, tipo, maneja_serie, maneja_lote,
           costo_promedio_cent, costo_ultima_compra_cent
    FROM productos WHERE id = ? AND empresa_id = ? AND activo = 1
  `).get(id, empresaId) as Fila | undefined)
}

export interface DocumentoNuevo {
  empresaId: number
  tipo: string
  numero: string
  numeroProveedor?: string
  proveedorId: number
  proveedorNombre: string
  proveedorRnc: string
  fecha: string
  vencimiento: string
  almacenId: number | null
  condicion: string
  estado: string
  usuarioId: number
  docOrigenId?: number | null
  motivo?: string
  comentarios?: string
}

export function insertarDocumento(db: Db, d: DocumentoNuevo): number {
  const res = db.prepare(`
    INSERT INTO documentos_compra (
      empresa_id, tipo, numero, numero_proveedor, proveedor_id, proveedor_nombre,
      proveedor_rnc, fecha, vencimiento, almacen_id, condicion, estado,
      doc_origen_id, motivo, comentarios, usuario_id
    ) VALUES (
      @empresaId, @tipo, @numero, @numeroProveedor, @proveedorId, @proveedorNombre,
      @proveedorRnc, @fecha, @vencimiento, @almacenId, @condicion, @estado,
      @docOrigenId, @motivo, @comentarios, @usuarioId
    )
  `).run({
    ...d,
    numeroProveedor: d.numeroProveedor ?? '',
    almacenId: d.almacenId ?? null,
    docOrigenId: d.docOrigenId ?? null,
    motivo: d.motivo ?? '',
    comentarios: d.comentarios ?? ''
  })
  return Number(res.lastInsertRowid)
}

export function actualizarTotales(
  db: Db, empresaId: number, id: number,
  totales: {
    subtotalCent: number; descuentoCent: number; impuestoCent: number
    gastoCent: number; totalCent: number; costoTotalCent: number
  }
): void {
  db.prepare(`
    UPDATE documentos_compra SET subtotal_cent = @subtotalCent, descuento_cent = @descuentoCent,
      impuesto_cent = @impuestoCent, gasto_cent = @gastoCent, total_cent = @totalCent,
      costo_total_cent = @costoTotalCent, actualizado_en = datetime('now')
    WHERE id = @id AND empresa_id = @empresaId
  `).run({ ...totales, id, empresaId })
}

export interface LineaNueva {
  empresaId: number
  docId: number
  productoId: number
  descripcion: string
  cantidad: number
  cantidadRecibida?: number
  cantidadDevuelta?: number
  precioCent: number
  descuentoPctBp: number
  descuentoCent: number
  gastoCent: number
  impuestoId: number | null
  impuestoCodigo: string
  tasaBp: number
  exento: boolean
  impuestoCent: number
  subtotalCent: number
  totalCent: number
  costoUnitCent: number
  numeroSerie: string
  lote: string
}

export function insertarLinea(db: Db, l: LineaNueva): number {
  const res = db.prepare(`
    INSERT INTO documento_compra_lineas (
      empresa_id, doc_id, producto_id, descripcion, cantidad, cantidad_recibida,
      cantidad_devuelta, precio_cent, descuento_pct_bp, descuento_cent, gasto_cent,
      impuesto_id, impuesto_codigo, tasa_bp, exento, impuesto_cent, subtotal_cent,
      total_cent, costo_unit_cent, numero_serie, lote
    ) VALUES (
      @empresaId, @docId, @productoId, @descripcion, @cantidad, @cantidadRecibida,
      @cantidadDevuelta, @precioCent, @descuentoPctBp, @descuentoCent, @gastoCent,
      @impuestoId, @impuestoCodigo, @tasaBp, @exento, @impuestoCent, @subtotalCent,
      @totalCent, @costoUnitCent, @numeroSerie, @lote
    )
  `).run({
    ...l,
    cantidadRecibida: l.cantidadRecibida ?? 0,
    cantidadDevuelta: l.cantidadDevuelta ?? 0,
    impuestoId: l.impuestoId ?? null,
    exento: l.exento ? 1 : 0
  })
  return Number(res.lastInsertRowid)
}

export function getLinea(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM documento_compra_lineas WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function listarLineas(db: Db, empresaId: number, docId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT * FROM documento_compra_lineas WHERE empresa_id = ? AND doc_id = ? ORDER BY id
  `).all(empresaId, docId) as Fila[])
}

export function getDocumento(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM documentos_compra WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function listarDocumentos(db: Db, empresaId: number, filtro: DocumentosFiltroCompraInput): Fila[] {
  const where = ['empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.tipo) { where.push('tipo = ?'); args.push(filtro.tipo) }
  if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
  if (filtro.proveedorId) { where.push('proveedor_id = ?'); args.push(filtro.proveedorId) }
  if (filtro.fechaDesde) { where.push('fecha >= ?'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('fecha <= ?'); args.push(filtro.fechaHasta) }
  args.push(filtro.limite ?? 300)
  return camelList(db.prepare(`
    SELECT * FROM documentos_compra WHERE ${where.join(' AND ')}
    ORDER BY fecha DESC, id DESC LIMIT ?
  `).all(...args) as Fila[])
}

export function setEstadoDocumento(db: Db, empresaId: number, id: number, estado: string): void {
  db.prepare(`
    UPDATE documentos_compra SET estado = ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(estado, id, empresaId)
}

export function incrementarRecibido(db: Db, empresaId: number, lineaId: number, cantidad: number): void {
  db.prepare(`
    UPDATE documento_compra_lineas SET cantidad_recibida = cantidad_recibida + ?
    WHERE id = ? AND empresa_id = ?
  `).run(cantidad, lineaId, empresaId)
}

export function decrementarRecibido(db: Db, empresaId: number, lineaId: number, cantidad: number): void {
  db.prepare(`
    UPDATE documento_compra_lineas SET cantidad_recibida = MAX(0, cantidad_recibida - ?)
    WHERE id = ? AND empresa_id = ?
  `).run(cantidad, lineaId, empresaId)
}

export function incrementarDevuelto(db: Db, empresaId: number, lineaId: number, cantidad: number): void {
  db.prepare(`
    UPDATE documento_compra_lineas SET cantidad_devuelta = cantidad_devuelta + ?
    WHERE id = ? AND empresa_id = ?
  `).run(cantidad, lineaId, empresaId)
}

export function insertarPago(
  db: Db, empresaId: number, docId: number, pago: {
    metodo: string; montoCent: number; referencia: string
    cajaSesionId?: number | null; cajaMovimientoId?: number | null; usuarioId: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO pagos_compra (
      empresa_id, doc_id, metodo, monto_cent, referencia,
      caja_sesion_id, caja_movimiento_id, usuario_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    empresaId, docId, pago.metodo, pago.montoCent, pago.referencia,
    pago.cajaSesionId ?? null, pago.cajaMovimientoId ?? null, pago.usuarioId
  )
  return Number(res.lastInsertRowid)
}

export function listarPagos(db: Db, empresaId: number, docId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT * FROM pagos_compra WHERE empresa_id = ? AND doc_id = ? ORDER BY id
  `).all(empresaId, docId) as Fila[])
}

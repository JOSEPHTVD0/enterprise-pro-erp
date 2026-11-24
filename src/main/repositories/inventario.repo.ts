import type { Db } from '../db/connection'
import { nextSerieNumber } from './configuracion.repo'
import type { ExistenciasFiltro, KardexFiltroInput } from '@shared/schemas/inventario'

export type Fila = Record<string, unknown>

function camel(row: Fila): Fila {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), v])
  )
}

export interface ProductoInventario {
  id: number
  descripcion: string
  codigo: string
  costo_promedio_cent: number
  maneja_serie: number
  maneja_lote: number
  activo: number
}

export interface AlmacenInventario {
  id: number
  codigo: string
  nombre: string
  activo: number
}

export function obtenerProducto(db: Db, empresaId: number, id: number): ProductoInventario | undefined {
  return db.prepare(`
    SELECT id, descripcion, codigo, costo_promedio_cent, maneja_serie, maneja_lote, activo
    FROM productos WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as ProductoInventario | undefined
}

export function obtenerAlmacen(db: Db, empresaId: number, id: number): AlmacenInventario | undefined {
  return db.prepare(`
    SELECT id, codigo, nombre, activo FROM almacenes WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as AlmacenInventario | undefined
}

export function listarProductos(db: Db, empresaId: number): Fila[] {
  return (db.prepare(`
    SELECT id, codigo, descripcion, costo_promedio_cent, maneja_serie, maneja_lote
    FROM productos WHERE empresa_id = ? AND activo = 1 ORDER BY descripcion
  `).all(empresaId) as Fila[]).map(camel)
}

export function listarAlmacenes(db: Db, empresaId: number): Fila[] {
  return (db.prepare(`
    SELECT id, codigo, nombre FROM almacenes WHERE empresa_id = ? AND activo = 1 ORDER BY principal DESC, nombre
  `).all(empresaId) as Fila[]).map(camel)
}

export interface Saldo {
  cantidad: number
  valor_cent: number
}

export function obtenerExistencia(
  db: Db, empresaId: number, productoId: number, almacenId: number
): Saldo | undefined {
  return db.prepare(`
    SELECT cantidad, valor_cent FROM existencias
    WHERE empresa_id = ? AND producto_id = ? AND almacen_id = ?
  `).get(empresaId, productoId, almacenId) as Saldo | undefined
}

export function listarExistencias(db: Db, empresaId: number, filtro: ExistenciasFiltro): Fila[] {
  const where = ['e.empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.almacenId) { where.push('e.almacen_id = ?'); args.push(filtro.almacenId) }
  if (filtro.productoId) { where.push('e.producto_id = ?'); args.push(filtro.productoId) }
  if (filtro.soloMinimos) where.push('e.cantidad <= p.existencia_min')
  return (db.prepare(`
    SELECT e.id, e.producto_id, e.almacen_id, e.cantidad, e.valor_cent,
           p.codigo, p.descripcion, p.existencia_min, p.maneja_serie, p.maneja_lote,
           a.codigo AS almacen_codigo, a.nombre AS almacen_nombre
    FROM existencias e
    JOIN productos p ON p.id = e.producto_id
    JOIN almacenes a ON a.id = e.almacen_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.descripcion, a.nombre
  `).all(...args) as Fila[]).map(camel)
}

/** UPSERT atómico del saldo. Se invoca siempre dentro de la transacción del movimiento. */
export function guardarExistencia(
  db: Db, empresaId: number, productoId: number, almacenId: number, cantidad: number, valorCent: number
): void {
  db.prepare(`
    INSERT INTO existencias (empresa_id, producto_id, almacen_id, cantidad, valor_cent)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(empresa_id, producto_id, almacen_id)
    DO UPDATE SET cantidad = excluded.cantidad, valor_cent = excluded.valor_cent,
                  actualizado_en = datetime('now')
  `).run(empresaId, productoId, almacenId, cantidad, Math.max(0, Math.round(valorCent)))
}

export interface MovimientoNuevo {
  empresaId: number
  tipo: string
  productoId: number
  almacenId: number
  cantidad: number
  costoUnitCent: number
  costoTotalCent: number
  saldoCantidad: number
  saldoCostoCent: number
  docTipo: string
  docId?: number | null
  docLineaId?: number | null
  motivo?: string
  referencia?: string
  usuarioId: number | null
}

/** Inserción sin UPDATE: el kardex queda protegido además por triggers en la BD. */
export function insertarMovimiento(db: Db, m: MovimientoNuevo): number {
  const res = db.prepare(`
    INSERT INTO movimientos_inventario (
      empresa_id, tipo, producto_id, almacen_id, cantidad, costo_unit_cent,
      costo_total_cent, saldo_cantidad, saldo_costo_cent, doc_tipo, doc_id,
      doc_linea_id, motivo, referencia, usuario_id
    ) VALUES (
      @empresaId, @tipo, @productoId, @almacenId, @cantidad, @costoUnitCent,
      @costoTotalCent, @saldoCantidad, @saldoCostoCent, @docTipo, @docId,
      @docLineaId, @motivo, @referencia, @usuarioId
    )
  `).run({
    docId: null, docLineaId: null, motivo: '', referencia: '', ...m
  })
  return Number(res.lastInsertRowid)
}

export function obtenerMovimiento(db: Db, empresaId: number, id: number): Fila | undefined {
  const row = db.prepare('SELECT * FROM movimientos_inventario WHERE id = ? AND empresa_id = ?').get(id, empresaId) as Fila | undefined
  return row ? camel(row) : undefined
}

export function listarKardex(db: Db, empresaId: number, filtro: KardexFiltroInput): Fila[] {
  const where = ['m.empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.productoId) { where.push('m.producto_id = ?'); args.push(filtro.productoId) }
  if (filtro.almacenId) { where.push('m.almacen_id = ?'); args.push(filtro.almacenId) }
  if (filtro.tipo) { where.push('m.tipo = ?'); args.push(filtro.tipo) }
  if (filtro.fechaDesde) { where.push('m.fecha >= ?'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('m.fecha <= ?'); args.push(`${filtro.fechaHasta} 23:59:59`) }
  args.push(filtro.limite ?? 300)
  return (db.prepare(`
    SELECT m.*, p.codigo, p.descripcion, a.nombre AS almacen_nombre
    FROM movimientos_inventario m
    JOIN productos p ON p.id = m.producto_id
    JOIN almacenes a ON a.id = m.almacen_id
    WHERE ${where.join(' AND ')}
    ORDER BY m.id DESC LIMIT ?
  `).all(...args) as Fila[]).map(camel)
}

export function siguienteNumero(db: Db, empresaId: number, tipo: 'AJUSTE_INVENTARIO' | 'TRANSFERENCIA_INVENTARIO'): string {
  return nextSerieNumber(db, empresaId, tipo)
}

export function guardarTransferencia(db: Db, datos: {
  empresaId: number; numero: string; motivo: string; usuarioId: number | null
  almacenOrigenId: number; almacenDestinoId: number
}): number {
  const res = db.prepare(`
    INSERT INTO transferencias (empresa_id, numero, motivo, usuario_id, almacen_origen_id, almacen_destino_id)
    VALUES (@empresaId, @numero, @motivo, @usuarioId, @almacenOrigenId, @almacenDestinoId)
  `).run(datos)
  return Number(res.lastInsertRowid)
}

export function guardarLineaTransferencia(
  db: Db, transferenciaId: number, productoId: number, cantidad: number, costoUnitCent: number
): number {
  const res = db.prepare(`
    INSERT INTO transferencia_lineas (transferencia_id, producto_id, cantidad, costo_unit_cent)
    VALUES (?, ?, ?, ?)
  `).run(transferenciaId, productoId, cantidad, costoUnitCent)
  return Number(res.lastInsertRowid)
}

export function vincularMovimientosTransferencia(
  db: Db, lineaId: number, salidaId: number, entradaId: number
): void {
  db.prepare(`
    UPDATE transferencia_lineas SET salida_movimiento_id = ?, entrada_movimiento_id = ? WHERE id = ?
  `).run(salidaId, entradaId, lineaId)
}

export function marcarTransferencia(db: Db, empresaId: number, id: number, estado: 'ACTIVO' | 'ANULADO'): void {
  db.prepare('UPDATE transferencias SET estado = ? WHERE id = ? AND empresa_id = ?').run(estado, id, empresaId)
}

export function obtenerTransferencia(db: Db, empresaId: number, id: number): Fila | undefined {
  const row = db.prepare('SELECT * FROM transferencias WHERE id = ? AND empresa_id = ?').get(id, empresaId) as Fila | undefined
  return row ? camel(row) : undefined
}

export function listarTransferencias(db: Db, empresaId: number): Fila[] {
  return (db.prepare(`
    SELECT t.*, o.nombre AS origen_nombre, d.nombre AS destino_nombre,
           (SELECT COUNT(*) FROM transferencia_lineas l WHERE l.transferencia_id = t.id) AS lineas
    FROM transferencias t
    JOIN almacenes o ON o.id = t.almacen_origen_id
    JOIN almacenes d ON d.id = t.almacen_destino_id
    WHERE t.empresa_id = ? ORDER BY t.id DESC LIMIT 300
  `).all(empresaId) as Fila[]).map(camel)
}

export function lineasTransferencia(db: Db, transferenciaId: number): Fila[] {
  return (db.prepare(`
    SELECT l.*, p.descripcion, p.codigo FROM transferencia_lineas l
    JOIN productos p ON p.id = l.producto_id WHERE l.transferencia_id = ? ORDER BY l.id
  `).all(transferenciaId) as Fila[]).map(camel)
}

export function guardarAjuste(db: Db, datos: {
  empresaId: number; numero: string; tipo: string; almacenId: number
  motivo: string; usuarioId: number | null
}): number {
  const res = db.prepare(`
    INSERT INTO ajustes_inventario (empresa_id, numero, tipo, almacen_id, motivo, usuario_id)
    VALUES (@empresaId, @numero, @tipo, @almacenId, @motivo, @usuarioId)
  `).run(datos)
  return Number(res.lastInsertRowid)
}

export function guardarLineaAjuste(db: Db, datos: {
  ajusteId: number; productoId: number; cantidad: number
  cantidadNueva: number | null; costoUnitCent: number; movimientoId: number
}): number {
  const res = db.prepare(`
    INSERT INTO ajuste_lineas (ajuste_id, producto_id, cantidad, cantidad_nueva, costo_unit_cent, movimiento_id)
    VALUES (@ajusteId, @productoId, @cantidad, @cantidadNueva, @costoUnitCent, @movimientoId)
  `).run(datos)
  return Number(res.lastInsertRowid)
}

export function marcarAjuste(db: Db, empresaId: number, id: number, estado: 'ACTIVO' | 'ANULADO'): void {
  db.prepare('UPDATE ajustes_inventario SET estado = ? WHERE id = ? AND empresa_id = ?').run(estado, id, empresaId)
}

export function obtenerAjuste(db: Db, empresaId: number, id: number): Fila | undefined {
  const row = db.prepare('SELECT * FROM ajustes_inventario WHERE id = ? AND empresa_id = ?').get(id, empresaId) as Fila | undefined
  return row ? camel(row) : undefined
}

export function listarAjustes(db: Db, empresaId: number): Fila[] {
  return (db.prepare(`
    SELECT a.*, al.nombre AS almacen_nombre,
           (SELECT COUNT(*) FROM ajuste_lineas l WHERE l.ajuste_id = a.id) AS lineas
    FROM ajustes_inventario a JOIN almacenes al ON al.id = a.almacen_id
    WHERE a.empresa_id = ? ORDER BY a.id DESC LIMIT 300
  `).all(empresaId) as Fila[]).map(camel)
}

export function lineasAjuste(db: Db, ajusteId: number): Fila[] {
  return (db.prepare(`
    SELECT l.*, p.descripcion, p.codigo FROM ajuste_lineas l
    JOIN productos p ON p.id = l.producto_id WHERE l.ajuste_id = ? ORDER BY l.id
  `).all(ajusteId) as Fila[]).map(camel)
}

export function registrarCosto(
  db: Db, empresaId: number, productoId: number, anterior: number, nuevo: number,
  origenDoc: string, origenId: number | null
): void {
  db.prepare(`
    INSERT INTO costos_historial (empresa_id, producto_id, costo_anterior_cent, costo_nuevo_cent, origen_doc, origen_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(empresaId, productoId, anterior, nuevo, origenDoc, origenId)
}

export function historialCostos(db: Db, empresaId: number, productoId: number): Fila[] {
  return (db.prepare(`
    SELECT * FROM costos_historial WHERE empresa_id = ? AND producto_id = ?
    ORDER BY id DESC LIMIT 200
  `).all(empresaId, productoId) as Fila[]).map(camel)
}

export function actualizarCostoProducto(
  db: Db, empresaId: number, productoId: number, costoPromedioCent: number, ultimaCompraCent?: number
): void {
  if (ultimaCompraCent === undefined) {
    db.prepare(`
      UPDATE productos SET costo_promedio_cent = ?, actualizado_en = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `).run(costoPromedioCent, productoId, empresaId)
    return
  }
  db.prepare(`
    UPDATE productos
    SET costo_promedio_cent = ?, costo_ultima_compra_cent = ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(costoPromedioCent, ultimaCompraCent, productoId, empresaId)
}

export function crearSerie(db: Db, datos: {
  empresaId: number; productoId: number; almacenId: number | null; serie: string
}): number {
  const res = db.prepare(`
    INSERT INTO series_producto (empresa_id, producto_id, almacen_id, serie)
    VALUES (@empresaId, @productoId, @almacenId, @serie)
  `).run(datos)
  return Number(res.lastInsertRowid)
}

export function listarSeries(db: Db, empresaId: number, productoId?: number): Fila[] {
  const args: unknown[] = [empresaId]
  let extra = ''
  if (productoId) { extra = ' AND s.producto_id = ?'; args.push(productoId) }
  return (db.prepare(`
    SELECT s.*, p.descripcion, p.codigo, a.nombre AS almacen_nombre
    FROM series_producto s JOIN productos p ON p.id = s.producto_id
    LEFT JOIN almacenes a ON a.id = s.almacen_id
    WHERE s.empresa_id = ?${extra} ORDER BY s.id DESC LIMIT 500
  `).all(...args) as Fila[]).map(camel)
}

export function crearLote(db: Db, datos: {
  empresaId: number; productoId: number; almacenId: number | null
  lote: string; vencimiento: string; cantidad: number
}): number {
  const res = db.prepare(`
    INSERT INTO lotes_producto (empresa_id, producto_id, almacen_id, lote, vencimiento, cantidad)
    VALUES (@empresaId, @productoId, @almacenId, @lote, @vencimiento, @cantidad)
  `).run(datos)
  return Number(res.lastInsertRowid)
}

export function listarLotes(db: Db, empresaId: number, productoId?: number): Fila[] {
  const args: unknown[] = [empresaId]
  let extra = ''
  if (productoId) { extra = ' AND l.producto_id = ?'; args.push(productoId) }
  return (db.prepare(`
    SELECT l.*, p.descripcion, p.codigo, a.nombre AS almacen_nombre
    FROM lotes_producto l JOIN productos p ON p.id = l.producto_id
    LEFT JOIN almacenes a ON a.id = l.almacen_id
    WHERE l.empresa_id = ?${extra} ORDER BY l.id DESC LIMIT 500
  `).all(...args) as Fila[]).map(camel)
}

/** Los lotes siguen el movimiento de existencias; nunca se borran, se ajusta su cantidad. */
export function ajustarLote(db: Db, empresaId: number, loteId: number, delta: number): void {
  db.prepare(`
    UPDATE lotes_producto SET cantidad = MAX(0, cantidad + ?)
    WHERE id = ? AND empresa_id = ?
  `).run(delta, loteId, empresaId)
}

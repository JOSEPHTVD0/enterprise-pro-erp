import type { Db } from '../db/connection'
import type { DocumentosFiltroInput } from '@shared/schemas/ventas'

export type Fila = Record<string, unknown>

export function camel(row: Fila | undefined): Fila | undefined {
  if (!row) return undefined
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v])
  )
}

const camelList = (rows: Fila[]): Fila[] => rows.map((r) => camel(r) as Fila)

export function getCliente(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, nombre, rnc_cedula, limite_credito_cent, balance_cent,
           condicion_pago_dias, vendedor_id
    FROM clientes WHERE id = ? AND empresa_id = ? AND activo = 1
  `).get(id, empresaId) as Fila | undefined)
}

export function getProducto(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, descripcion, precio1_cent, precio_minimo_cent, impuesto_id, tipo,
           maneja_serie, maneja_lote, costo_promedio_cent
    FROM productos WHERE id = ? AND empresa_id = ? AND activo = 1
  `).get(id, empresaId) as Fila | undefined)
}

export function getImpuesto(db: Db, empresaId: number, id?: number): Fila | undefined {
  if (id) {
    return camel(db.prepare(`
      SELECT id, codigo, tasa_bp, exento FROM impuestos
      WHERE id = ? AND empresa_id = ? AND activo = 1
    `).get(id, empresaId) as Fila | undefined)
  }
  const param = db.prepare(`
    SELECT valor FROM parametros WHERE empresa_id = ? AND clave = 'itbis_por_defecto'
  `).get(empresaId) as { valor: string } | undefined
  return camel(db.prepare(`
    SELECT id, codigo, tasa_bp, exento FROM impuestos
    WHERE empresa_id = ? AND codigo = ? AND activo = 1
  `).get(empresaId, param?.valor || 'ITBIS18') as Fila | undefined)
}

export interface DocumentoNuevo {
  empresaId: number
  tipo: string
  numero: string
  esNcf: boolean
  clienteId: number
  clienteNombre: string
  clienteRnc: string
  fecha: string
  vencimiento: string
  vendedorId?: number | null
  almacenId?: number | null
  condicion: string
  estado: string
  usuarioId: number
  docOrigenId?: number | null
  motivo?: string
  comentarios?: string
}

export function insertarDocumento(db: Db, d: DocumentoNuevo): number {
  const res = db.prepare(`
    INSERT INTO documentos_venta (
      empresa_id, tipo, numero, es_ncf, cliente_id, cliente_nombre, cliente_rnc,
      fecha, vencimiento, vendedor_id, almacen_id, condicion, estado,
      doc_origen_id, motivo, comentarios, usuario_id
    ) VALUES (
      @empresaId, @tipo, @numero, @esNcf, @clienteId, @clienteNombre, @clienteRnc,
      @fecha, @vencimiento, @vendedorId, @almacenId, @condicion, @estado,
      @docOrigenId, @motivo, @comentarios, @usuarioId
    )
  `).run({
    ...d,
    esNcf: d.esNcf ? 1 : 0,
    vendedorId: d.vendedorId ?? null,
    almacenId: d.almacenId ?? null,
    docOrigenId: d.docOrigenId ?? null,
    motivo: d.motivo ?? '',
    comentarios: d.comentarios ?? ''
  })
  return Number(res.lastInsertRowid)
}

export function actualizarTotales(
  db: Db, empresaId: number, id: number,
  totales: { subtotalCent: number; descuentoCent: number; impuestoCent: number; totalCent: number; costoTotalCent: number }
): void {
  db.prepare(`
    UPDATE documentos_venta SET subtotal_cent = @subtotalCent, descuento_cent = @descuentoCent,
      impuesto_cent = @impuestoCent, total_cent = @totalCent, costo_total_cent = @costoTotalCent,
      actualizado_en = datetime('now')
    WHERE id = @id AND empresa_id = @empresaId
  `).run({ ...totales, id, empresaId })
}

export interface LineaNueva {
  empresaId: number
  docId: number
  productoId: number
  descripcion: string
  cantidad: number
  precioCent: number
  descuentoPctBp: number
  descuentoCent: number
  impuestoId: number | null
  impuestoCodigo: string
  tasaBp: number
  exento: boolean
  impuestoCent: number
  subtotalCent: number
  totalCent: number
  numeroSerie: string
  lote: string
}

export function insertarLinea(db: Db, l: LineaNueva): number {
  const res = db.prepare(`
    INSERT INTO documento_venta_lineas (
      empresa_id, doc_id, producto_id, descripcion, cantidad, precio_cent,
      descuento_pct_bp, descuento_cent, impuesto_id, impuesto_codigo, tasa_bp,
      exento, impuesto_cent, subtotal_cent, total_cent, numero_serie, lote
    ) VALUES (
      @empresaId, @docId, @productoId, @descripcion, @cantidad, @precioCent,
      @descuentoPctBp, @descuentoCent, @impuestoId, @impuestoCodigo, @tasaBp,
      @exento, @impuestoCent, @subtotalCent, @totalCent, @numeroSerie, @lote
    )
  `).run({ ...l, impuestoId: l.impuestoId ?? null, exento: l.exento ? 1 : 0 })
  return Number(res.lastInsertRowid)
}

export function getLinea(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM documento_venta_lineas WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function listarLineas(db: Db, empresaId: number, docId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT * FROM documento_venta_lineas WHERE empresa_id = ? AND doc_id = ? ORDER BY id
  `).all(empresaId, docId) as Fila[])
}

export function setCostoLinea(db: Db, empresaId: number, id: number, costoUnitCent: number): void {
  db.prepare(`
    UPDATE documento_venta_lineas SET costo_unit_cent = ? WHERE id = ? AND empresa_id = ?
  `).run(costoUnitCent, id, empresaId)
}

export function getDocumento(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM documentos_venta WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function listarDocumentos(db: Db, empresaId: number, filtro: DocumentosFiltroInput): Fila[] {
  const where = ['empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.tipo) { where.push('tipo = ?'); args.push(filtro.tipo) }
  if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
  if (filtro.clienteId) { where.push('cliente_id = ?'); args.push(filtro.clienteId) }
  if (filtro.numero) { where.push('numero LIKE ?'); args.push(`%${filtro.numero}%`) }
  if (filtro.montoMinCent !== undefined) { where.push('total_cent >= ?'); args.push(filtro.montoMinCent) }
  if (filtro.montoMaxCent !== undefined) { where.push('total_cent <= ?'); args.push(filtro.montoMaxCent) }
  if (filtro.productoId) {
    where.push(`EXISTS (
      SELECT 1 FROM documento_venta_lineas l
      WHERE l.doc_id = documentos_venta.id AND l.producto_id = ?
    )`)
    args.push(filtro.productoId)
  }
  if (filtro.fechaDesde) { where.push('fecha >= ?'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('fecha <= ?'); args.push(filtro.fechaHasta) }
  args.push(filtro.limite ?? 300)
  return camelList(db.prepare(`
    SELECT * FROM documentos_venta WHERE ${where.join(' AND ')}
    ORDER BY fecha DESC, id DESC LIMIT ?
  `).all(...args) as Fila[])
}

export function setEstadoDocumento(db: Db, empresaId: number, id: number, estado: string): void {
  db.prepare(`
    UPDATE documentos_venta SET estado = ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(estado, id, empresaId)
}

export function insertarPago(
  db: Db, empresaId: number, docId: number, pago: {
    metodo: string; montoCent: number; referencia: string
    cajaSesionId?: number | null; cajaMovimientoId?: number | null; usuarioId: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO documento_pagos (
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
    SELECT * FROM documento_pagos WHERE empresa_id = ? AND doc_id = ? ORDER BY id
  `).all(empresaId, docId) as Fila[])
}

export function insertarConduce(
  db: Db, empresaId: number, numero: string, docVentaId: number, fecha: string, usuarioId: number
): number {
  const res = db.prepare(`
    INSERT INTO conduces (empresa_id, numero, doc_venta_id, fecha, usuario_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(empresaId, numero, docVentaId, fecha, usuarioId)
  return Number(res.lastInsertRowid)
}

export function insertarConduceLinea(
  db: Db, empresaId: number, conduceId: number, docLineaId: number, cantidad: number
): void {
  db.prepare(`
    INSERT INTO conduce_lineas (empresa_id, conduce_id, doc_linea_id, cantidad)
    VALUES (?, ?, ?, ?)
  `).run(empresaId, conduceId, docLineaId, cantidad)
}

export function getConduce(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT c.*, d.numero AS documento_numero, d.cliente_nombre
    FROM conduces c JOIN documentos_venta d ON d.id = c.doc_venta_id
    WHERE c.id = ? AND c.empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function listarConduces(db: Db, empresaId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT c.*, d.numero AS documento_numero, d.cliente_nombre
    FROM conduces c JOIN documentos_venta d ON d.id = c.doc_venta_id
    WHERE c.empresa_id = ? ORDER BY c.fecha DESC, c.id DESC LIMIT 300
  `).all(empresaId) as Fila[])
}

export function listarConduceLineas(db: Db, empresaId: number, conduceId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT cl.*, dl.descripcion, dl.cantidad AS cantidad_documento,
           dl.cantidad_entregada, dl.producto_id
    FROM conduce_lineas cl JOIN documento_venta_lineas dl ON dl.id = cl.doc_linea_id
    WHERE cl.empresa_id = ? AND cl.conduce_id = ? ORDER BY cl.id
  `).all(empresaId, conduceId) as Fila[])
}

export function setEstadoConduce(db: Db, empresaId: number, id: number, estado: string): void {
  db.prepare('UPDATE conduces SET estado = ? WHERE id = ? AND empresa_id = ?').run(estado, id, empresaId)
}

export function incrementarEntregado(db: Db, empresaId: number, docLineaId: number, cantidad: number): void {
  db.prepare(`
    UPDATE documento_venta_lineas SET cantidad_entregada = cantidad_entregada + ?
    WHERE id = ? AND empresa_id = ?
  `).run(cantidad, docLineaId, empresaId)
}

export function suspender(db: Db, empresaId: number, usuarioId: number, cajaId: number | null, nombre: string, payload: string): number {
  const res = db.prepare(`
    INSERT INTO ventas_suspendidas (empresa_id, usuario_id, caja_id, nombre, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(empresaId, usuarioId, cajaId, nombre, payload)
  return Number(res.lastInsertRowid)
}

export function listarSuspendidas(db: Db, empresaId: number, usuarioId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT id, nombre, fecha, caja_id FROM ventas_suspendidas
    WHERE empresa_id = ? AND usuario_id = ? ORDER BY fecha DESC, id DESC
  `).all(empresaId, usuarioId) as Fila[])
}

export function recuperar(db: Db, empresaId: number, id: number): string | undefined {
  const row = db.prepare(`
    SELECT payload FROM ventas_suspendidas WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as { payload: string } | undefined
  if (row) db.prepare('DELETE FROM ventas_suspendidas WHERE id = ? AND empresa_id = ?').run(id, empresaId)
  return row?.payload
}

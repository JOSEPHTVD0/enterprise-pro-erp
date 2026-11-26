import type { Db } from '../db/connection'
import type { DocumentosFiltroCompraInput } from '@shared/schemas/compras'
import type { ImpuestoAgrupado } from '@shared/impuestos'
import { camel, type Fila } from './ventas.repo'

/** Persistencia de compras. Todos los importes se guardan como enteros en centavos. */
const camelList = (rows: Fila[]): Fila[] => rows.map((r) => camel(r) as Fila)

export { getImpuesto } from './ventas.repo'

export function getProveedor(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, codigo, nombre_comercial, razon_social, rnc, condicion_pago_dias, balance_cent,
           cuenta_bancaria, activo
    FROM proveedores WHERE id = ? AND empresa_id = ? AND activo = 1
  `).get(id, empresaId) as Fila | undefined)
}

export function getProducto(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT id, codigo, descripcion, referencia, impuesto_id, tipo, maneja_serie, maneja_lote,
           costo_promedio_cent, costo_ultima_compra_cent, precio1_cent
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
  nota?: string
  fechaLlegada?: string
  numeroOrdenCompra?: string
  clasificacionContable?: string
  monedaCodigo?: string
  tasaAplicada?: number
  montoFacturaMonedaCent?: number
  montoFacturaCent?: number
  ajusteCent?: number
}

export function insertarDocumento(db: Db, d: DocumentoNuevo): number {
  const res = db.prepare(`
    INSERT INTO documentos_compra (
      empresa_id, tipo, numero, numero_proveedor, proveedor_id, proveedor_nombre,
      proveedor_rnc, fecha, vencimiento, almacen_id, condicion, estado,
      doc_origen_id, motivo, comentarios, nota, fecha_llegada, numero_orden_compra,
      clasificacion_contable, moneda_codigo, tasa_aplicada,
      monto_factura_moneda_cent, monto_factura_cent, ajuste_cent, usuario_id
    ) VALUES (
      @empresaId, @tipo, @numero, @numeroProveedor, @proveedorId, @proveedorNombre,
      @proveedorRnc, @fecha, @vencimiento, @almacenId, @condicion, @estado,
      @docOrigenId, @motivo, @comentarios, @nota, @fechaLlegada, @numeroOrdenCompra,
      @clasificacionContable, @monedaCodigo, @tasaAplicada,
      @montoFacturaMonedaCent, @montoFacturaCent, @ajusteCent, @usuarioId
    )
  `).run({
    ...d,
    numeroProveedor: d.numeroProveedor ?? '',
    almacenId: d.almacenId ?? null,
    docOrigenId: d.docOrigenId ?? null,
    motivo: d.motivo ?? '',
    comentarios: d.comentarios ?? '',
    nota: d.nota ?? '',
    fechaLlegada: d.fechaLlegada ?? '',
    numeroOrdenCompra: d.numeroOrdenCompra ?? '',
    clasificacionContable: d.clasificacionContable ?? '1200',
    monedaCodigo: d.monedaCodigo ?? 'DOP',
    tasaAplicada: d.tasaAplicada ?? 1,
    montoFacturaMonedaCent: d.montoFacturaMonedaCent ?? 0,
    montoFacturaCent: d.montoFacturaCent ?? 0,
    ajusteCent: d.ajusteCent ?? 0
  })
  return Number(res.lastInsertRowid)
}

export interface TotalesDocumento {
  subtotalCent: number
  descuentoCent: number
  impuestoCent: number
  gastoCent: number
  totalCent: number
  costoTotalCent: number
  descuento1Cent?: number
  descuento2Cent?: number
  descuentoItemsCent?: number
  fleteCent?: number
  baseCent?: number
  exentoCent?: number
  gravadoCent?: number
  montoFacturaCent?: number
  diferenciaCent?: number
  motivoDiferencia?: string
}

export function actualizarTotales(
  db: Db, empresaId: number, id: number, totales: TotalesDocumento
): void {
  db.prepare(`
    UPDATE documentos_compra SET subtotal_cent = @subtotalCent, descuento_cent = @descuentoCent,
      impuesto_cent = @impuestoCent, gasto_cent = @gastoCent, total_cent = @totalCent,
      costo_total_cent = @costoTotalCent, descuento1_cent = @descuento1Cent,
      descuento2_cent = @descuento2Cent, descuento_items_cent = @descuentoItemsCent,
      flete_cent = @fleteCent, base_cent = @baseCent, exento_cent = @exentoCent,
      gravado_cent = @gravadoCent, monto_factura_cent = @montoFacturaCent,
      diferencia_cent = @diferenciaCent, motivo_diferencia = @motivoDiferencia,
      actualizado_en = datetime('now')
    WHERE id = @id AND empresa_id = @empresaId
  `).run({
    ...totales,
    descuento1Cent: totales.descuento1Cent ?? 0,
    descuento2Cent: totales.descuento2Cent ?? 0,
    descuentoItemsCent: totales.descuentoItemsCent ?? totales.descuentoCent,
    fleteCent: totales.fleteCent ?? totales.gastoCent,
    baseCent: totales.baseCent ?? Math.max(0, totales.subtotalCent - totales.descuentoCent),
    exentoCent: totales.exentoCent ?? 0,
    gravadoCent: totales.gravadoCent ?? Math.max(0, totales.subtotalCent - totales.descuentoCent),
    montoFacturaCent: totales.montoFacturaCent ?? totales.totalCent,
    diferenciaCent: totales.diferenciaCent ?? 0,
    motivoDiferencia: totales.motivoDiferencia ?? '',
    id,
    empresaId
  })
}

/** Actualiza la cabecera editable del ingreso sin tocar numeración ni totales. */
export function actualizarIngreso(
  db: Db, empresaId: number, id: number,
  datos: {
    proveedorId: number; proveedorNombre: string; proveedorRnc: string
    almacenId: number; fecha: string; fechaLlegada: string; vencimiento: string
    numeroProveedor: string; numeroOrdenCompra: string; clasificacionContable: string
    monedaCodigo: string; tasaAplicada: number; montoFacturaMonedaCent: number
    ajusteCent: number; comentarios: string; nota: string; condicion: string
  }
): void {
  db.prepare(`
    UPDATE documentos_compra SET proveedor_id = @proveedorId, proveedor_nombre = @proveedorNombre,
      proveedor_rnc = @proveedorRnc, almacen_id = @almacenId, fecha = @fecha,
      fecha_llegada = @fechaLlegada, vencimiento = @vencimiento,
      numero_proveedor = @numeroProveedor, numero_orden_compra = @numeroOrdenCompra,
      clasificacion_contable = @clasificacionContable, moneda_codigo = @monedaCodigo,
      tasa_aplicada = @tasaAplicada, monto_factura_moneda_cent = @montoFacturaMonedaCent,
      ajuste_cent = @ajusteCent, comentarios = @comentarios, nota = @nota,
      condicion = @condicion, actualizado_en = datetime('now')
    WHERE id = @id AND empresa_id = @empresaId
  `).run({ ...datos, id, empresaId })
}

export function setAsiento(db: Db, empresaId: number, id: number, asientoId: number | null): void {
  db.prepare(`UPDATE documentos_compra SET asiento_id = ? WHERE id = ? AND empresa_id = ?`)
    .run(asientoId, id, empresaId)
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
  descuento1PctBp?: number
  descuento1Cent?: number
  descuento2PctBp?: number
  descuento2Cent?: number
  descuento3PctBp?: number
  descuento3Cent?: number
  baseCent?: number
  referencia?: string
  pvsCent?: number
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
      cantidad_devuelta, precio_cent, descuento_pct_bp, descuento_cent,
      descuento1_pct_bp, descuento1_cent, descuento2_pct_bp, descuento2_cent,
      descuento3_pct_bp, descuento3_cent, base_cent, referencia, pvs_cent, gasto_cent,
      impuesto_id, impuesto_codigo, tasa_bp, exento, impuesto_cent, subtotal_cent,
      total_cent, costo_unit_cent, numero_serie, lote
    ) VALUES (
      @empresaId, @docId, @productoId, @descripcion, @cantidad, @cantidadRecibida,
      @cantidadDevuelta, @precioCent, @descuentoPctBp, @descuentoCent,
      @descuento1PctBp, @descuento1Cent, @descuento2PctBp, @descuento2Cent,
      @descuento3PctBp, @descuento3Cent, @baseCent, @referencia, @pvsCent, @gastoCent,
      @impuestoId, @impuestoCodigo, @tasaBp, @exento, @impuestoCent, @subtotalCent,
      @totalCent, @costoUnitCent, @numeroSerie, @lote
    )
  `).run({
    ...l,
    cantidadRecibida: l.cantidadRecibida ?? 0,
    cantidadDevuelta: l.cantidadDevuelta ?? 0,
    descuento1PctBp: l.descuento1PctBp ?? l.descuentoPctBp,
    descuento1Cent: l.descuento1Cent ?? l.descuentoCent,
    descuento2PctBp: l.descuento2PctBp ?? 0,
    descuento2Cent: l.descuento2Cent ?? 0,
    descuento3PctBp: l.descuento3PctBp ?? 0,
    descuento3Cent: l.descuento3Cent ?? 0,
    baseCent: l.baseCent ?? Math.max(0, l.subtotalCent - l.descuentoCent),
    referencia: l.referencia ?? '',
    pvsCent: l.pvsCent ?? 0,
    impuestoId: l.impuestoId ?? null,
    exento: l.exento ? 1 : 0
  })
  return Number(res.lastInsertRowid)
}

export function eliminarLineas(db: Db, empresaId: number, docId: number): void {
  db.prepare('DELETE FROM documento_compra_lineas WHERE empresa_id = ? AND doc_id = ?')
    .run(empresaId, docId)
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

export function insertarImpuestos(
  db: Db, empresaId: number, docId: number, grupos: ImpuestoAgrupado[]
): void {
  const insertar = db.prepare(`
    INSERT OR IGNORE INTO documento_compra_impuestos
      (empresa_id, doc_id, impuesto_id, codigo, tasa_bp, base_cent, impuesto_cent, exento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const grupo of grupos) {
    insertar.run(
      empresaId, docId, null, grupo.codigo, grupo.tasaBp,
      grupo.baseCent, grupo.impuestoCent, grupo.exento ? 1 : 0
    )
  }
}

export function listarImpuestos(db: Db, empresaId: number, docId: number): Fila[] {
  return camelList(db.prepare(`
    SELECT * FROM documento_compra_impuestos
    WHERE empresa_id = ? AND doc_id = ? ORDER BY tasa_bp, codigo
  `).all(empresaId, docId) as Fila[])
}

export function eliminarImpuestos(db: Db, empresaId: number, docId: number): void {
  db.prepare('DELETE FROM documento_compra_impuestos WHERE empresa_id = ? AND doc_id = ?')
    .run(empresaId, docId)
}

export function getDocumento(db: Db, empresaId: number, id: number): Fila | undefined {
  return camel(db.prepare(`
    SELECT * FROM documentos_compra WHERE id = ? AND empresa_id = ?
  `).get(id, empresaId) as Fila | undefined)
}

export function existeNumeroProveedor(
  db: Db, empresaId: number, tipo: string, numeroProveedor: string,
  proveedorId?: number, excluirId?: number
): boolean {
  if (!numeroProveedor.trim()) return false
  return Boolean(db.prepare(`
    SELECT 1 FROM documentos_compra
     WHERE empresa_id = ? AND tipo = ? AND numero_proveedor = ?
       AND estado <> 'ANULADO' AND (? IS NULL OR proveedor_id = ?)
       AND (? IS NULL OR id <> ?)
     LIMIT 1
  `).get(
    empresaId, tipo, numeroProveedor.trim(),
    proveedorIdOrNull(proveedorId), proveedorIdOrNull(proveedorId),
    excluirId ?? null, excluirId ?? null
  ))
}

const proveedorIdOrNull = (valor?: number): number | null => valor ?? null

export function listarDocumentos(
  db: Db, empresaId: number,
  filtro: DocumentosFiltroCompraInput & { texto?: string }
): Fila[] {
  const where = ['empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.tipo) { where.push('tipo = ?'); args.push(filtro.tipo) }
  if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
  else if (filtro.incluirAnulados === false) { where.push("estado <> 'ANULADO'") }
  if (filtro.proveedorId) { where.push('proveedor_id = ?'); args.push(filtro.proveedorId) }
  if (filtro.almacenId) { where.push('almacen_id = ?'); args.push(filtro.almacenId) }
  if (filtro.usuarioId) { where.push('usuario_id = ?'); args.push(filtro.usuarioId) }
  if (filtro.numero) { where.push('numero LIKE ?'); args.push(`%${filtro.numero}%`) }
  if (filtro.numeroProveedor) { where.push('numero_proveedor LIKE ?'); args.push(`%${filtro.numeroProveedor}%`) }
  if (filtro.texto) {
    where.push('(numero LIKE ? OR numero_proveedor LIKE ? OR numero_orden_compra LIKE ? OR proveedor_nombre LIKE ?)')
    const texto = `%${filtro.texto}%`
    args.push(texto, texto, texto, texto)
  }
  if (filtro.fechaDesde) { where.push('fecha >= ?'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('fecha <= ?'); args.push(filtro.fechaHasta) }
  args.push(filtro.limite ?? 300, filtro.offset ?? 0)
  return camelList(db.prepare(`
    SELECT * FROM documentos_compra WHERE ${where.join(' AND ')}
    ORDER BY fecha DESC, id DESC LIMIT ? OFFSET ?
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

export function eliminarPagos(db: Db, empresaId: number, docId: number): void {
  db.prepare('DELETE FROM pagos_compra WHERE empresa_id = ? AND doc_id = ?')
    .run(empresaId, docId)
}

export function insertarVersion(
  db: Db, empresaId: number, datos: {
    docId: number; numero: string; operacion: string; antes: unknown
    despues: unknown; motivo?: string; usuarioId: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO compra_versiones
      (empresa_id, doc_id, numero, operacion, valores_antes, valores_despues, motivo, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    empresaId, datos.docId, datos.numero, datos.operacion,
    JSON.stringify(datos.antes ?? null), JSON.stringify(datos.despues ?? null),
    datos.motivo ?? '', datos.usuarioId
  )
  return Number(res.lastInsertRowid)
}

export function listarVersiones(db: Db, empresaId: number, docId?: number): Fila[] {
  const sql = docId
    ? `SELECT * FROM compra_versiones WHERE empresa_id = ? AND doc_id = ? ORDER BY id DESC LIMIT 200`
    : `SELECT * FROM compra_versiones WHERE empresa_id = ? ORDER BY id DESC LIMIT 200`
  return camelList(db.prepare(sql).all(...(docId ? [empresaId, docId] : [empresaId])) as Fila[])
}

export function insertarReimpresion(
  db: Db, empresaId: number, datos: {
    docId: number; formato: string; motivo?: string; usuarioId: number; sesionId?: number
  }
): number {
  const res = db.prepare(`
    INSERT INTO compra_reimpresiones
      (empresa_id, doc_id, formato, motivo, usuario_id, sesion_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    empresaId, datos.docId, datos.formato, datos.motivo ?? '',
    datos.usuarioId, datos.sesionId ?? null
  )
  return Number(res.lastInsertRowid)
}

export function listarReimpresiones(db: Db, empresaId: number, docId?: number): Fila[] {
  const sql = docId
    ? `SELECT * FROM compra_reimpresiones WHERE empresa_id = ? AND doc_id = ? ORDER BY id DESC LIMIT 200`
    : `SELECT * FROM compra_reimpresiones WHERE empresa_id = ? ORDER BY id DESC LIMIT 200`
  return camelList(db.prepare(sql).all(...(docId ? [empresaId, docId] : [empresaId])) as Fila[])
}

/** Auditoría de compras para el historial del ingreso. */
export function listarAuditoriaDocumento(db: Db, empresaId: number, docId?: number): Fila[] {
  const sql = docId
    ? `SELECT * FROM auditoria WHERE empresa_id = ? AND entidad = 'documentos_compra'
        AND entidad_id = ? ORDER BY id DESC LIMIT 200`
    : `SELECT * FROM auditoria WHERE empresa_id = ? AND entidad = 'documentos_compra'
        ORDER BY id DESC LIMIT 200`
  return camelList(db.prepare(sql).all(...(docId ? [empresaId, String(docId)] : [empresaId])) as Fila[])
}

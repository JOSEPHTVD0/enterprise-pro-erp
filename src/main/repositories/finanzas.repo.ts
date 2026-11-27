import type { Db } from '../db/connection'
import { camel, type Fila } from './ventas.repo'
import type { FinanzasFiltro, MovimientosBancoFiltro, SesionesCajaFiltro } from '@shared/schemas/finanzas'

type Listado = { where: string[]; args: (string | number)[]; limite: number }

type OpcionesFiltro = {
  /** Columna de fecha cuando la tabla no usa `fecha` (sesiones, recurrentes). */
  fecha?: string
  /** Columna de entidad cuando el filtro aplica (cliente, proveedor, anticipo). */
  entidad?: string
  /** `null` cuando la tabla no tiene columna `estado`. */
  estado?: string | null
  /** Columna sobre la que se aplica la búsqueda por número/referencia. */
  numero?: string
  /** Columna de importe para los filtros de rango. */
  monto?: string
}

function filtroBase(
  filtro: FinanzasFiltro | undefined, alias: string, opciones: OpcionesFiltro = {}
): Listado {
  const f = filtro ?? { limite: 300 }
  const columnaFecha = opciones.fecha ?? `${alias}.fecha`
  const columnaEstado = opciones.estado === null ? undefined : opciones.estado ?? `${alias}.estado`
  const where: string[] = []
  const args: (string | number)[] = []
  if (f.desde) { where.push(`${columnaFecha} >= ?`); args.push(f.desde) }
  if (f.hasta) { where.push(`${columnaFecha} <= ?`); args.push(f.hasta) }
  if (f.entidadId && opciones.entidad) { where.push(`${opciones.entidad} = ?`); args.push(f.entidadId) }
  if (f.estado && columnaEstado) { where.push(`${columnaEstado} = ?`); args.push(f.estado) }
  if (f.numero && opciones.numero) { where.push(`${opciones.numero} LIKE ?`); args.push(`%${f.numero}%`) }
  if (f.montoMinCent !== undefined && opciones.monto) { where.push(`${opciones.monto} >= ?`); args.push(f.montoMinCent) }
  if (f.montoMaxCent !== undefined && opciones.monto) { where.push(`${opciones.monto} <= ?`); args.push(f.montoMaxCent) }
  return { where, args, limite: f.limite }
}

function lista(db: Db, sql: string, args: (string | number)[]): Fila[] {
  return (db.prepare(sql).all(...args) as Fila[]).map((r) => camel(r) as Fila)
}

function uno(db: Db, sql: string, args: (string | number)[]): Fila | undefined {
  return camel(db.prepare(sql).get(...args) as Fila | undefined)
}

// ------------------------------- CxC ----------------------------------------

export function listarCxc(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'c', {
    entidad: 'c.cliente_id', numero: 'c.numero_documento', monto: 'c.saldo_cent'
  })
  const where = [...f.where]
  const args: (string | number)[] = [empresaId, ...f.args]
  if (filtro?.productoId) {
    where.push(`EXISTS (
      SELECT 1 FROM documento_venta_lineas l
      WHERE l.doc_id = c.doc_venta_id AND l.producto_id = ?
    )`)
    args.push(filtro.productoId)
  }
  args.push(f.limite)
  return lista(db, `
    SELECT c.*, cl.nombre AS clienteNombre, cl.rnc_cedula AS clienteRnc,
      CAST(julianday('now') - julianday(c.fecha) AS INTEGER) AS antiguedadDias
    FROM cxc_documentos c
    JOIN clientes cl ON cl.id = c.cliente_id AND cl.empresa_id = c.empresa_id
    WHERE c.empresa_id = ? ${where.length ? `AND ${where.join(' AND ')}` : ''}
    ORDER BY c.id DESC LIMIT ?
  `, args)
}

export function getCxc(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `
    SELECT c.*, cl.nombre AS clienteNombre, cl.rnc_cedula AS clienteRnc
    FROM cxc_documentos c JOIN clientes cl ON cl.id = c.cliente_id AND cl.empresa_id = c.empresa_id
    WHERE c.id = ? AND c.empresa_id = ?
  `, [id, empresaId])
}

export function listarRecibosCxc(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'r', { entidad: 'r.cliente_id', numero: 'r.numero', monto: 'r.monto_cent' })
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT r.*, cl.nombre AS clienteNombre FROM cxc_recibos r
    JOIN clientes cl ON cl.id = r.cliente_id AND cl.empresa_id = r.empresa_id
    WHERE r.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY r.id DESC LIMIT ?
  `, args)
}

export function getReciboCxc(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `
    SELECT r.*, cl.nombre AS clienteNombre FROM cxc_recibos r
    JOIN clientes cl ON cl.id = r.cliente_id AND cl.empresa_id = r.empresa_id
    WHERE r.id = ? AND r.empresa_id = ?
  `, [id, empresaId])
}

export function listarAplicacionesCxc(db: Db, empresaId: number, reciboId: number): Fila[] {
  return lista(db, `
    SELECT a.*, d.numero_documento AS numeroDocumento, d.saldo_cent AS saldoDocumentoCent
    FROM cxc_recibo_aplicaciones a
    JOIN cxc_documentos d ON d.id = a.cxc_documento_id AND d.empresa_id = a.empresa_id
    WHERE a.empresa_id = ? AND a.recibo_id = ? ORDER BY a.id
  `, [empresaId, reciboId])
}

export function movimientosCxcPorRecibo(db: Db, empresaId: number, numero: string): Fila[] {
  return lista(db, `
    SELECT * FROM cxc_movimientos
    WHERE empresa_id = ? AND referencia = ? ORDER BY id
  `, [empresaId, numero])
}

export function insertarReciboCxc(db: Db, dato: {
  empresaId: number; numero: string; clienteId: number; clienteNombre: string
  fecha: string; montoCent: number; metodo: string; referencia: string
  anticipoId: number | null; cajaSesionId: number | null; cajaMovimientoId: number | null
  bancoCuentaId: number | null; bancoMovimientoId: number | null
  comentarios: string; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO cxc_recibos (
      empresa_id, numero, cliente_id, cliente_nombre, fecha, monto_cent, metodo, referencia,
      anticipo_id, caja_sesion_id, caja_movimiento_id, banco_cuenta_id, banco_movimiento_id,
      comentarios, usuario_id
    ) VALUES (
      @empresaId, @numero, @clienteId, @clienteNombre, @fecha, @montoCent, @metodo, @referencia,
      @anticipoId, @cajaSesionId, @cajaMovimientoId, @bancoCuentaId, @bancoMovimientoId,
      @comentarios, @usuarioId
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function insertarAplicacionCxc(db: Db, empresaId: number, reciboId: number, cxcDocumentoId: number, montoCent: number): number {
  const res = db.prepare(`
    INSERT INTO cxc_recibo_aplicaciones (empresa_id, recibo_id, cxc_documento_id, monto_cent)
    VALUES (?, ?, ?, ?)
  `).run(empresaId, reciboId, cxcDocumentoId, montoCent)
  return Number(res.lastInsertRowid)
}

export function anularReciboCxc(db: Db, empresaId: number, id: number): void {
  db.prepare(`
    UPDATE cxc_recibos SET estado = 'ANULADO' WHERE id = ? AND empresa_id = ?
  `).run(id, empresaId)
}

export function listarAnticipos(db: Db, empresaId: number, tipo: 'CLIENTE' | 'PROVEEDOR', filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'a', { entidad: 'a.entidad_id', numero: 'a.referencia', monto: 'a.saldo_cent' })
  const args: (string | number)[] = [empresaId, tipo, ...f.args, f.limite]
  return lista(db, `
    SELECT a.*, COALESCE(cl.nombre, pr.nombre_comercial) AS entidadNombre
    FROM anticipos a
    LEFT JOIN clientes cl ON a.tipo = 'CLIENTE' AND cl.id = a.entidad_id AND cl.empresa_id = a.empresa_id
    LEFT JOIN proveedores pr ON a.tipo = 'PROVEEDOR' AND pr.id = a.entidad_id AND pr.empresa_id = a.empresa_id
    WHERE a.empresa_id = ? AND a.tipo = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY a.id DESC LIMIT ?
  `, args)
}

export function getAnticipo(db: Db, empresaId: number, id: number, tipo?: 'CLIENTE' | 'PROVEEDOR'): Fila | undefined {
  return uno(db, `
    SELECT * FROM anticipos WHERE id = ? AND empresa_id = ? ${tipo ? 'AND tipo = ?' : ''}
  `, tipo ? [id, empresaId, tipo] : [id, empresaId])
}

export function insertarAnticipo(db: Db, dato: {
  empresaId: number; tipo: string; entidadId: number; fecha: string; montoCent: number
  referencia: string; cajaMovimientoId: number | null; bancoMovimientoId: number | null; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO anticipos (
      empresa_id, tipo, entidad_id, fecha, monto_cent, saldo_cent, referencia,
      caja_movimiento_id, banco_movimiento_id, usuario_id
    ) VALUES (
      @empresaId, @tipo, @entidadId, @fecha, @montoCent, @montoCent, @referencia,
      @cajaMovimientoId, @bancoMovimientoId, @usuarioId
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function ajustarAnticipo(db: Db, empresaId: number, id: number, deltaCent: number): void {
  db.prepare(`
    UPDATE anticipos SET saldo_cent = saldo_cent + ?,
      estado = CASE WHEN saldo_cent + ? <= 0 THEN 'APLICADO' ELSE 'ACTIVO' END
    WHERE id = ? AND empresa_id = ?
  `).run(deltaCent, deltaCent, id, empresaId)
}

// ------------------------------- CxP ----------------------------------------

export function listarCxp(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'p', { entidad: 'p.proveedor_id' })
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT p.*, pr.nombre_comercial AS proveedorNombre, pr.rnc AS proveedorRnc,
      CAST(julianday('now') - julianday(p.fecha) AS INTEGER) AS antiguedadDias
    FROM cxp_documentos p
    JOIN proveedores pr ON pr.id = p.proveedor_id AND pr.empresa_id = p.empresa_id
    WHERE p.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY p.id DESC LIMIT ?
  `, args)
}

export function getCxp(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `
    SELECT p.*, pr.nombre_comercial AS proveedorNombre, pr.rnc AS proveedorRnc
    FROM cxp_documentos p JOIN proveedores pr ON pr.id = p.proveedor_id AND pr.empresa_id = p.empresa_id
    WHERE p.id = ? AND p.empresa_id = ?
  `, [id, empresaId])
}

export function listarPagosCxp(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'p', { entidad: 'p.proveedor_id' })
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT p.*, pr.nombre_comercial AS proveedorNombre FROM cxp_pagos p
    JOIN proveedores pr ON pr.id = p.proveedor_id AND pr.empresa_id = p.empresa_id
    WHERE p.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY p.id DESC LIMIT ?
  `, args)
}

export function getPagoCxp(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `
    SELECT p.*, pr.nombre_comercial AS proveedorNombre FROM cxp_pagos p
    JOIN proveedores pr ON pr.id = p.proveedor_id AND pr.empresa_id = p.empresa_id
    WHERE p.id = ? AND p.empresa_id = ?
  `, [id, empresaId])
}

export function listarAplicacionesCxp(db: Db, empresaId: number, pagoId: number): Fila[] {
  return lista(db, `
    SELECT a.*, d.numero_documento AS numeroDocumento, d.saldo_cent AS saldoDocumentoCent
    FROM cxp_pago_aplicaciones a
    JOIN cxp_documentos d ON d.id = a.cxp_documento_id AND d.empresa_id = a.empresa_id
    WHERE a.empresa_id = ? AND a.pago_id = ? ORDER BY a.id
  `, [empresaId, pagoId])
}

export function movimientosCxpPorPago(db: Db, empresaId: number, numero: string): Fila[] {
  return lista(db, `
    SELECT * FROM cxp_movimientos WHERE empresa_id = ? AND referencia = ? ORDER BY id
  `, [empresaId, numero])
}

export function insertarPagoCxp(db: Db, dato: {
  empresaId: number; numero: string; proveedorId: number; proveedorNombre: string
  fecha: string; montoCent: number; metodo: string; referencia: string
  anticipoId: number | null; cajaSesionId: number | null; cajaMovimientoId: number | null
  bancoCuentaId: number | null; bancoMovimientoId: number | null
  comentarios: string; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO cxp_pagos (
      empresa_id, numero, proveedor_id, proveedor_nombre, fecha, monto_cent, metodo, referencia,
      anticipo_id, caja_sesion_id, caja_movimiento_id, banco_cuenta_id, banco_movimiento_id,
      comentarios, usuario_id
    ) VALUES (
      @empresaId, @numero, @proveedorId, @proveedorNombre, @fecha, @montoCent, @metodo, @referencia,
      @anticipoId, @cajaSesionId, @cajaMovimientoId, @bancoCuentaId, @bancoMovimientoId,
      @comentarios, @usuarioId
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function insertarAplicacionCxp(db: Db, empresaId: number, pagoId: number, cxpDocumentoId: number, montoCent: number): number {
  const res = db.prepare(`
    INSERT INTO cxp_pago_aplicaciones (empresa_id, pago_id, cxp_documento_id, monto_cent)
    VALUES (?, ?, ?, ?)
  `).run(empresaId, pagoId, cxpDocumentoId, montoCent)
  return Number(res.lastInsertRowid)
}

export function anularPagoCxp(db: Db, empresaId: number, id: number): void {
  db.prepare(`UPDATE cxp_pagos SET estado = 'ANULADO' WHERE id = ? AND empresa_id = ?`).run(id, empresaId)
}

// ------------------------------- Bancos -------------------------------------

export function listarCuentasBanco(db: Db, empresaId: number): Fila[] {
  return lista(db, `SELECT * FROM bancos_cuentas WHERE empresa_id = ? ORDER BY id`, [empresaId])
}

export function getCuentaBanco(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM bancos_cuentas WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function insertarCuentaBanco(db: Db, dato: {
  empresaId: number; codigo: string; nombre: string; banco: string; numeroCuenta: string
  tipo: string; saldoInicialCent: number; activa: boolean
}): number {
  const res = db.prepare(`
    INSERT INTO bancos_cuentas (
      empresa_id, codigo, nombre, banco, numero_cuenta, tipo, saldo_inicial_cent, saldo_cent, activa
    ) VALUES (
      @empresaId, @codigo, @nombre, @banco, @numeroCuenta, @tipo,
      @saldoInicialCent, @saldoInicialCent, @activa
    )
  `).run({ ...dato, activa: dato.activa ? 1 : 0 })
  return Number(res.lastInsertRowid)
}

export function ajustarSaldoCuenta(db: Db, empresaId: number, cuentaId: number, deltaCent: number): void {
  db.prepare(`
    UPDATE bancos_cuentas SET saldo_cent = saldo_cent + ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(deltaCent, cuentaId, empresaId)
}

export function listarMovimientosBanco(db: Db, empresaId: number, filtro?: MovimientosBancoFiltro): Fila[] {
  const f = filtroBase(filtro as FinanzasFiltro | undefined, 'm', { estado: null })
  if (filtro?.cuentaId) { f.where.push('m.cuenta_id = ?'); f.args.push(filtro.cuentaId) }
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT m.*, c.nombre AS cuentaNombre FROM bancos_movimientos m
    JOIN bancos_cuentas c ON c.id = m.cuenta_id AND c.empresa_id = m.empresa_id
    WHERE m.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY m.id DESC LIMIT ?
  `, args)
}

export function getMovimientoBanco(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM bancos_movimientos WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function insertarMovimientoBanco(db: Db, dato: {
  empresaId: number; cuentaId: number; fecha: string; tipo: string; montoCent: number
  referencia: string; docTipo: string; docId: number | null; descripcion: string; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO bancos_movimientos (
      empresa_id, cuenta_id, fecha, tipo, monto_cent, referencia, doc_tipo, doc_id, descripcion, usuario_id
    ) VALUES (
      @empresaId, @cuentaId, @fecha, @tipo, @montoCent, @referencia,
      @docTipo, @docId, @descripcion, @usuarioId
    )
  `).run({ ...dato, docId: dato.docId ?? null })
  return Number(res.lastInsertRowid)
}

export function marcarMovimientoConciliado(db: Db, empresaId: number, id: number): void {
  db.prepare(`UPDATE bancos_movimientos SET conciliado = 1 WHERE id = ? AND empresa_id = ?`).run(id, empresaId)
}

export function listarConciliaciones(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'c', { estado: 'c.estado' })
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT c.*, b.nombre AS cuentaNombre FROM bancos_conciliaciones c
    JOIN bancos_cuentas b ON b.id = c.cuenta_id AND b.empresa_id = c.empresa_id
    WHERE c.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY c.id DESC LIMIT ?
  `, args)
}

export function insertarConciliacion(db: Db, dato: {
  empresaId: number; cuentaId: number; fecha: string; periodoDesde: string; periodoHasta: string
  saldoBancoCent: number; saldoLibroCent: number; diferenciaCent: number
  observaciones: string; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO bancos_conciliaciones (
      empresa_id, cuenta_id, fecha, periodo_desde, periodo_hasta, saldo_banco_cent,
      saldo_libro_cent, diferencia_cent, observaciones, usuario_id
    ) VALUES (
      @empresaId, @cuentaId, @fecha, @periodoDesde, @periodoHasta, @saldoBancoCent,
      @saldoLibroCent, @diferenciaCent, @observaciones, @usuarioId
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function insertarLineaConciliacion(db: Db, empresaId: number, conciliacionId: number, movimientoId: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO bancos_conciliacion_lineas (empresa_id, conciliacion_id, movimiento_id)
    VALUES (?, ?, ?)
  `).run(empresaId, conciliacionId, movimientoId)
}

// ------------------------------- Caja ---------------------------------------

export function listarSesionesCaja(db: Db, empresaId: number, filtro?: SesionesCajaFiltro): Fila[] {
  const f = filtroBase(filtro as FinanzasFiltro | undefined, 's', {
    fecha: 's.fecha_apertura', estado: 's.estado'
  })
  if (filtro?.cajaId) { f.where.push('s.caja_id = ?'); f.args.push(filtro.cajaId) }
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT s.*, c.codigo AS cajaCodigo, c.nombre AS cajaNombre,
      u.nombre AS usuarioNombre, uc.nombre AS usuarioCierreNombre
    FROM caja_sesiones s
    JOIN cajas c ON c.id = s.caja_id AND c.empresa_id = s.empresa_id
    LEFT JOIN usuarios u ON u.id = s.usuario_id
    LEFT JOIN usuarios uc ON uc.id = s.usuario_cierre_id
    WHERE s.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY s.id DESC LIMIT ?
  `, args)
}

export function registrarArqueo(db: Db, empresaId: number, sesionId: number, arqueoEfectivoCent: number, arqueoOtrosCent: number, usuarioCierreId: number): void {
  db.prepare(`
    UPDATE caja_sesiones SET arqueo_efectivo_cent = ?, arqueo_otros_cent = ?, usuario_cierre_id = ?
    WHERE id = ? AND empresa_id = ?
  `).run(arqueoEfectivoCent, arqueoOtrosCent, usuarioCierreId, sesionId, empresaId)
}

// ------------------------------- Gastos -------------------------------------

export function listarCategoriasGasto(db: Db, empresaId: number): Fila[] {
  return lista(db, `SELECT * FROM gastos_categorias WHERE empresa_id = ? ORDER BY id`, [empresaId])
}

export function getCategoriaGasto(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM gastos_categorias WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function insertarCategoriaGasto(db: Db, empresaId: number, codigo: string, nombre: string, activa: boolean): number {
  const res = db.prepare(`
    INSERT INTO gastos_categorias (empresa_id, codigo, nombre, activa) VALUES (?, ?, ?, ?)
  `).run(empresaId, codigo, nombre, activa ? 1 : 0)
  return Number(res.lastInsertRowid)
}

export function listarGastos(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'g', { entidad: 'g.proveedor_id' })
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT g.*, cat.nombre AS categoriaNombre, pr.nombre_comercial AS proveedorNombre
    FROM gastos g
    JOIN gastos_categorias cat ON cat.id = g.categoria_id AND cat.empresa_id = g.empresa_id
    LEFT JOIN proveedores pr ON pr.id = g.proveedor_id AND pr.empresa_id = g.empresa_id
    WHERE g.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY g.id DESC LIMIT ?
  `, args)
}

export function getGasto(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `
    SELECT g.*, cat.nombre AS categoriaNombre, pr.nombre_comercial AS proveedorNombre
    FROM gastos g
    JOIN gastos_categorias cat ON cat.id = g.categoria_id AND cat.empresa_id = g.empresa_id
    LEFT JOIN proveedores pr ON pr.id = g.proveedor_id AND pr.empresa_id = g.empresa_id
    WHERE g.id = ? AND g.empresa_id = ?
  `, [id, empresaId])
}

export function insertarGasto(db: Db, dato: {
  empresaId: number; numero: string; categoriaId: number; proveedorId: number | null
  fecha: string; concepto: string; montoCent: number; impuestoCent: number; totalCent: number
  metodo: string; recurrenteId: number | null; cajaSesionId: number | null
  cajaMovimientoId: number | null; bancoCuentaId: number | null
  bancoMovimientoId: number | null; estado: string; docReferencia: string; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO gastos (
      empresa_id, numero, categoria_id, proveedor_id, fecha, concepto, monto_cent, impuesto_cent,
      total_cent, metodo, recurrente_id, caja_sesion_id, caja_movimiento_id, banco_cuenta_id,
      banco_movimiento_id, estado, doc_referencia, usuario_id
    ) VALUES (
      @empresaId, @numero, @categoriaId, @proveedorId, @fecha, @concepto, @montoCent, @impuestoCent,
      @totalCent, @metodo, @recurrenteId, @cajaSesionId, @cajaMovimientoId, @bancoCuentaId,
      @bancoMovimientoId, @estado, @docReferencia, @usuarioId
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function pagarGasto(db: Db, dato: {
  empresaId: number; id: number; metodo: string; cajaSesionId: number | null
  cajaMovimientoId: number | null; bancoCuentaId: number | null
  bancoMovimientoId: number | null; referencia: string
}): void {
  db.prepare(`
    UPDATE gastos SET estado = 'CONTABILIZADO', metodo = @metodo,
      caja_sesion_id = @cajaSesionId, caja_movimiento_id = @cajaMovimientoId,
      banco_cuenta_id = @bancoCuentaId, banco_movimiento_id = @bancoMovimientoId,
      doc_referencia = @referencia
    WHERE id = @id AND empresa_id = @empresaId AND estado = 'PENDIENTE'
  `).run(dato)
}

export function anularGasto(db: Db, empresaId: number, id: number): void {
  db.prepare(`UPDATE gastos SET estado = 'ANULADO' WHERE id = ? AND empresa_id = ?`).run(id, empresaId)
}

export function listarRecurrentes(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'r', { fecha: 'r.proxima_fecha', estado: null })
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT r.*, cat.nombre AS categoriaNombre, pr.nombre_comercial AS proveedorNombre
    FROM gastos_recurrentes r
    JOIN gastos_categorias cat ON cat.id = r.categoria_id AND cat.empresa_id = r.empresa_id
    LEFT JOIN proveedores pr ON pr.id = r.proveedor_id AND pr.empresa_id = r.empresa_id
    WHERE r.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY r.id DESC LIMIT ?
  `, args)
}

export function getRecurrente(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM gastos_recurrentes WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function insertarRecurrente(db: Db, dato: {
  empresaId: number; categoriaId: number; proveedorId: number | null; concepto: string
  montoCent: number; impuestoCent: number; frecuencia: string; proximaFecha: string
  activa: boolean; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO gastos_recurrentes (
      empresa_id, categoria_id, proveedor_id, concepto, monto_cent, impuesto_cent,
      frecuencia, proxima_fecha, activa, usuario_id
    ) VALUES (
      @empresaId, @categoriaId, @proveedorId, @concepto, @montoCent, @impuestoCent,
      @frecuencia, @proximaFecha, @activa, @usuarioId
    )
  `).run({ ...dato, activa: dato.activa ? 1 : 0 })
  return Number(res.lastInsertRowid)
}

export function avanzarRecurrente(db: Db, empresaId: number, id: number, proximaFecha: string): void {
  db.prepare(`UPDATE gastos_recurrentes SET proxima_fecha = ? WHERE id = ? AND empresa_id = ?`)
    .run(proximaFecha, id, empresaId)
}

// ------------------------------ Comisiones ---------------------------------

export function listarComisiones(db: Db, empresaId: number, filtro?: FinanzasFiltro): Fila[] {
  const f = filtroBase(filtro, 'com')
  const args: (string | number)[] = [empresaId, ...f.args, f.limite]
  return lista(db, `
    SELECT com.*, v.nombre AS vendedorNombre, d.numero AS documentoNumero
    FROM comisiones com
    JOIN vendedores v ON v.id = com.vendedor_id AND v.empresa_id = com.empresa_id
    JOIN documentos_venta d ON d.id = com.doc_venta_id AND d.empresa_id = com.empresa_id
    WHERE com.empresa_id = ? ${f.where.length ? `AND ${f.where.join(' AND ')}` : ''}
    ORDER BY com.id DESC LIMIT ?
  `, args)
}

export function getComision(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM comisiones WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function insertarComision(db: Db, dato: {
  empresaId: number; vendedorId: number; docVentaId: number; baseCent: number
  pctBp: number; montoCent: number; fecha: string; usuarioId: number
}): number {
  const res = db.prepare(`
    INSERT INTO comisiones (
      empresa_id, vendedor_id, doc_venta_id, base_cent, pct_bp, monto_cent, fecha, usuario_id
    ) VALUES (
      @empresaId, @vendedorId, @docVentaId, @baseCent, @pctBp, @montoCent, @fecha, @usuarioId
    )
  `).run(dato)
  return Number(res.lastInsertRowid)
}

export function pagarComision(db: Db, dato: {
  empresaId: number; id: number; fechaPago: string; pagoReferencia: string; metodo: string
  cajaMovimientoId: number | null; bancoMovimientoId: number | null
}): void {
  db.prepare(`
    UPDATE comisiones SET estado = 'PAGADA', fecha_pago = @fechaPago,
      pago_referencia = @pagoReferencia, metodo = @metodo,
      caja_movimiento_id = @cajaMovimientoId, banco_movimiento_id = @bancoMovimientoId
    WHERE id = @id AND empresa_id = @empresaId AND estado = 'PENDIENTE'
  `).run(dato)
}

// ------------------------- Apoyos transaccionales ---------------------------

export function getClienteFin(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM clientes WHERE id = ? AND empresa_id = ? AND activo = 1`, [id, empresaId])
}

export function getProveedorFin(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM proveedores WHERE id = ? AND empresa_id = ? AND activo = 1`, [id, empresaId])
}

export function getVendedorFin(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM vendedores WHERE id = ? AND empresa_id = ? AND activo = 1`, [id, empresaId])
}

/** Devuelve saldo al documento de CxC al anular un recibo. */
export function abonarCxc(db: Db, empresaId: number, id: number, montoCent: number): void {
  db.prepare(`
    UPDATE cxc_documentos SET saldo_cent = MIN(monto_cent, saldo_cent + ?), estado = 'PENDIENTE'
    WHERE id = ? AND empresa_id = ? AND estado <> 'ANULADO'
  `).run(montoCent, id, empresaId)
}

/** Devuelve saldo a un documento de CxP ya pagado al anular un pago. */
export function abonarCxpDocumento(db: Db, empresaId: number, docCompraId: number, montoCent: number): void {
  db.prepare(`
    UPDATE cxp_documentos SET saldo_cent = MIN(monto_cent, saldo_cent + ?), estado = 'PENDIENTE'
    WHERE empresa_id = ? AND doc_compra_id = ? AND estado <> 'ANULADO'
  `).run(montoCent, empresaId, docCompraId)
}

export function listarAplicacionesPorDocumentoCxc(db: Db, empresaId: number, cxcDocumentoId: number): Fila[] {
  return lista(db, `
    SELECT a.*, r.numero AS numeroRecibo, r.metodo, r.fecha AS fechaRecibo
    FROM cxc_recibo_aplicaciones a
    JOIN cxc_recibos r ON r.id = a.recibo_id AND r.empresa_id = a.empresa_id
    WHERE a.empresa_id = ? AND a.cxc_documento_id = ? ORDER BY a.id
  `, [empresaId, cxcDocumentoId])
}

export function listarAplicacionesPorDocumentoCxp(db: Db, empresaId: number, cxpDocumentoId: number): Fila[] {
  return lista(db, `
    SELECT a.*, p.numero AS numeroPago, p.metodo, p.fecha AS fechaPago
    FROM cxp_pago_aplicaciones a
    JOIN cxp_pagos p ON p.id = a.pago_id AND p.empresa_id = a.empresa_id
    WHERE a.empresa_id = ? AND a.cxp_documento_id = ? ORDER BY a.id
  `, [empresaId, cxpDocumentoId])
}

export function movimientosCxcPorDocumento(db: Db, empresaId: number, cxcDocumentoId: number): Fila[] {
  return lista(db, `
    SELECT * FROM cxc_movimientos WHERE empresa_id = ? AND cxc_documento_id = ? ORDER BY id
  `, [empresaId, cxcDocumentoId])
}

export function movimientosCxpPorDocumento(db: Db, empresaId: number, cxpDocumentoId: number): Fila[] {
  return lista(db, `
    SELECT * FROM cxp_movimientos WHERE empresa_id = ? AND cxp_documento_id = ? ORDER BY id
  `, [empresaId, cxpDocumentoId])
}

/** Descuenta un abono del saldo de CxC y marca el documento como pagado al llegar a cero. */
export function aplicarCxc(db: Db, empresaId: number, id: number, montoCent: number): void {
  db.prepare(`
    UPDATE cxc_documentos
    SET saldo_cent = MAX(0, saldo_cent - ?),
      estado = CASE WHEN saldo_cent - ? <= 0 THEN 'PAGADO' ELSE 'PENDIENTE' END
    WHERE id = ? AND empresa_id = ? AND estado <> 'ANULADO'
  `).run(montoCent, montoCent, id, empresaId)
}

export function getMovimientoCajaFin(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM caja_movimientos WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function getMovimientoBancoFin(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM bancos_movimientos WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function getConciliacionFin(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `SELECT * FROM bancos_conciliaciones WHERE id = ? AND empresa_id = ?`, [id, empresaId])
}

export function getDocumentoVentaComision(db: Db, empresaId: number, id: number): Fila | undefined {
  return uno(db, `
    SELECT id, total_cent FROM documentos_venta
    WHERE id = ? AND empresa_id = ? AND estado = 'ACTIVO'
  `, [id, empresaId])
}

/** Ligadura del movimiento de origen al documento financiero que lo originó. */
export function ligarMovimientoCaja(db: Db, empresaId: number, movimientoId: number, docId: number): void {
  db.prepare(`UPDATE caja_movimientos SET doc_id = ? WHERE id = ? AND empresa_id = ?`)
    .run(docId, movimientoId, empresaId)
}

export function ligarMovimientoBanco(db: Db, empresaId: number, movimientoId: number, docId: number): void {
  db.prepare(`UPDATE bancos_movimientos SET doc_id = ? WHERE id = ? AND empresa_id = ?`)
    .run(docId, movimientoId, empresaId)
}

/** Catálogos de solo lectura para los formularios de Finanzas. */
export function catalogosFin(
  db: Db, empresaId: number, permitidos: (clave: string) => boolean = () => true
): Record<string, Fila[]> {
  const rows = (sql: string) => lista(db, sql, [empresaId])
  const vacio: Fila[] = []
  return {
    clientes: permitidos('cxc.consultar') || permitidos('cobros.consultar') ? rows(`
      SELECT id, codigo, nombre, rnc_cedula, balance_cent, limite_credito_cent
      FROM clientes WHERE empresa_id = ? AND activo = 1 ORDER BY nombre
    `) : vacio,
    proveedores: permitidos('cxp.consultar') ? rows(`
      SELECT id, codigo, nombre_comercial, rnc, balance_cent
      FROM proveedores WHERE empresa_id = ? AND activo = 1 ORDER BY nombre_comercial
    `) : vacio,
    vendedores: permitidos('cxc.consultar') || permitidos('ventas.consultar') ? rows(`
      SELECT id, codigo, nombre, comision_pct_bp FROM vendedores
      WHERE empresa_id = ? AND activo = 1 ORDER BY nombre
    `) : vacio,
    cajas: permitidos('cajas.consultar') ? rows(`SELECT id, codigo, nombre FROM cajas WHERE empresa_id = ? AND activa = 1 ORDER BY id`) : vacio,
    bancosCuentas: permitidos('bancos.consultar') ? rows(`
      SELECT id, codigo, nombre, banco, numero_cuenta, tipo, saldo_cent
      FROM bancos_cuentas WHERE empresa_id = ? AND activa = 1 ORDER BY id
    `) : vacio,
    gastoCategorias: permitidos('gastos.consultar') ? rows(`
      SELECT id, codigo, nombre FROM gastos_categorias
      WHERE empresa_id = ? AND activa = 1 ORDER BY nombre
    `) : vacio,
    documentosVenta: permitidos('cxc.consultar') || permitidos('cobros.consultar') ? rows(`
      SELECT id, numero, tipo, total_cent, cliente_id, cliente_nombre, estado
      FROM documentos_venta WHERE empresa_id = ? AND estado = 'ACTIVO' ORDER BY id DESC LIMIT 300
    `) : vacio
  }
}

import type { Db } from '../db/connection'
import { padresPlanCuentasBase, planCuentasBase } from '../../shared/contabilidad'
import { nextSerieNumber } from './configuracion.repo'

/** Acceso a datos de contabilidad. Toda consulta está parametrizada por empresa. */

export type Fila = Record<string, unknown>

export const n = (f: Fila | undefined, clave: string): number => Number(f?.[clave] ?? 0)
export const txt = (f: Fila | undefined, clave: string): string => String(f?.[clave] ?? '')

export interface FiltroListado {
  fechaDesde?: string
  fechaHasta?: string
  estado?: string
  limite?: number
}

export interface FiltroPeriodos {
  anio?: number
  estado?: string
  limite?: number
}

export interface LineaAsiento {
  cuentaId: number
  debeCent: number
  haberCent: number
  descripcion: string
}

export interface DatosAsiento {
  fecha: string
  descripcion: string
  tipo: string
  periodoId: number
  usuarioId: number
}

export interface DatosCuenta {
  codigo: string
  nombre: string
  tipo: string
  naturaleza: string
  padreId?: number | null
  nivel: number
  aceptaMovimiento: boolean
  activa?: boolean
}

/** Siembra el plan base de una empresa nueva (el integrador lo llama desde `seedCompany`). */
export function seedPlanContable(db: Db, empresaId: number): void {
  const buscarPadre = db.prepare('SELECT id FROM plan_cuentas WHERE empresa_id = ? AND codigo = ?')
  const insertar = db.prepare(`
    INSERT OR IGNORE INTO plan_cuentas
      (empresa_id, codigo, nombre, tipo, naturaleza, padre_id, nivel, acepta_movimiento, activa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `)
  for (const cuenta of planCuentasBase) {
    const codigoPadre = padresPlanCuentasBase[cuenta.codigo]
    const padre = codigoPadre
      ? (buscarPadre.get(empresaId, codigoPadre) as { id: number } | undefined)
      : undefined
    insertar.run(empresaId, cuenta.codigo, cuenta.nombre, cuenta.tipo, cuenta.naturaleza,
      padre?.id ?? null, cuenta.nivel, cuenta.aceptaMovimiento ? 1 : 0)
  }
}

// ------------------------------------------------------------------ Cuentas
export function listarCuentas(db: Db, empresaId: number, filtro: FiltroListado = {}): Fila[] {
  const where = ['empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.estado === 'ACTIVA' || filtro.estado === 'INACTIVA') {
    where.push('activa = ?')
    args.push(filtro.estado === 'ACTIVA' ? 1 : 0)
  }
  return db.prepare(`SELECT * FROM plan_cuentas WHERE ${where.join(' AND ')}
    ORDER BY codigo LIMIT ?`).all(...args, filtro.limite ?? 300) as Fila[]
}

export function obtenerCuenta(db: Db, empresaId: number, id: number): Fila | undefined {
  return db.prepare('SELECT * FROM plan_cuentas WHERE id = ? AND empresa_id = ?')
    .get(id, empresaId) as Fila | undefined
}

export function obtenerCuentaPorCodigo(db: Db, empresaId: number, codigo: string): Fila | undefined {
  return db.prepare('SELECT * FROM plan_cuentas WHERE codigo = ? AND empresa_id = ?')
    .get(codigo, empresaId) as Fila | undefined
}

export function insertarCuenta(db: Db, empresaId: number, datos: DatosCuenta): number {
  const resultado = db.prepare(`
    INSERT INTO plan_cuentas
      (empresa_id, codigo, nombre, tipo, naturaleza, padre_id, nivel, acepta_movimiento, activa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(empresaId, datos.codigo, datos.nombre, datos.tipo, datos.naturaleza,
    datos.padreId ?? null, datos.nivel, datos.aceptaMovimiento ? 1 : 0,
    datos.activa === false ? 0 : 1)
  return Number(resultado.lastInsertRowid)
}

export function actualizarCuenta(
  db: Db, empresaId: number,
  datos: { id: number; nombre: string; tipo: string; naturaleza: string; aceptaMovimiento: boolean; activa: boolean }
): number {
  const resultado = db.prepare(`
    UPDATE plan_cuentas SET nombre = ?, tipo = ?, naturaleza = ?, acepta_movimiento = ?,
      activa = ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(datos.nombre, datos.tipo, datos.naturaleza, datos.aceptaMovimiento ? 1 : 0,
    datos.activa ? 1 : 0, datos.id, empresaId)
  return resultado.changes
}

export function actualizarEstadoCuenta(db: Db, empresaId: number, id: number, activa: boolean): number {
  const resultado = db.prepare(`
    UPDATE plan_cuentas SET activa = ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(activa ? 1 : 0, id, empresaId)
  return resultado.changes
}

// ------------------------------------------------------------------ Periodos
export function listarPeriodos(db: Db, empresaId: number, filtro: FiltroPeriodos = {}): Fila[] {
  const where = ['empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.anio !== undefined) { where.push('anio = ?'); args.push(filtro.anio) }
  if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
  return db.prepare(`SELECT * FROM periodos_contables WHERE ${where.join(' AND ')}
    ORDER BY anio DESC, mes DESC LIMIT ?`).all(...args, filtro.limite ?? 300) as Fila[]
}

export function obtenerPeriodo(db: Db, empresaId: number, id: number): Fila | undefined {
  return db.prepare('SELECT * FROM periodos_contables WHERE id = ? AND empresa_id = ?')
    .get(id, empresaId) as Fila | undefined
}

export function periodoParaFecha(db: Db, empresaId: number, fecha: string): Fila | undefined {
  const anio = Number(fecha.slice(0, 4))
  const mes = Number(fecha.slice(5, 7))
  if (!Number.isInteger(anio) || !Number.isInteger(mes)) return undefined
  return db.prepare(`
    SELECT * FROM periodos_contables WHERE empresa_id = ? AND anio = ? AND mes = ?
  `).get(empresaId, anio, mes) as Fila | undefined
}

export function obtenerPeriodoPorAnioMes(db: Db, empresaId: number, anio: number, mes: number): Fila | undefined {
  return db.prepare(`
    SELECT * FROM periodos_contables WHERE empresa_id = ? AND anio = ? AND mes = ?
  `).get(empresaId, anio, mes) as Fila | undefined
}

export function crearPeriodoSiFalta(db: Db, empresaId: number, anio: number, mes: number): number {
  db.prepare(`
    INSERT OR IGNORE INTO periodos_contables (empresa_id, anio, mes, estado)
    VALUES (?, ?, ?, 'ABIERTO')
  `).run(empresaId, anio, mes)
  const periodo = db.prepare(`
    SELECT id FROM periodos_contables WHERE empresa_id = ? AND anio = ? AND mes = ?
  `).get(empresaId, anio, mes) as { id: number }
  return Number(periodo.id)
}

export function abrirPeriodo(db: Db, empresaId: number, id: number): number {
  return db.prepare(`
    UPDATE periodos_contables SET estado = 'ABIERTO', cerrado_en = ''
    WHERE id = ? AND empresa_id = ?
  `).run(id, empresaId).changes
}

export function cerrarPeriodo(db: Db, empresaId: number, id: number): number {
  return db.prepare(`
    UPDATE periodos_contables SET estado = 'CERRADO', cerrado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(id, empresaId).changes
}

export function contarBorradoresEnPeriodo(db: Db, empresaId: number, periodoId: number): number {
  const fila = db.prepare(`
    SELECT COUNT(*) AS total FROM asientos
    WHERE empresa_id = ? AND periodo_id = ? AND estado = 'BORRADOR'
  `).get(empresaId, periodoId) as Fila
  return n(fila, 'total')
}

// ------------------------------------------------------------------ Asientos
export function listarAsientos(db: Db, empresaId: number, filtro: FiltroListado = {}): Fila[] {
  const where = ['empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
  if (filtro.fechaDesde) { where.push('date(fecha) >= date(?)'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('date(fecha) <= date(?)'); args.push(filtro.fechaHasta) }
  return db.prepare(`SELECT * FROM asientos WHERE ${where.join(' AND ')}
    ORDER BY fecha DESC, id DESC LIMIT ?`).all(...args, filtro.limite ?? 300) as Fila[]
}

export function obtenerAsiento(db: Db, empresaId: number, id: number): Fila | undefined {
  return db.prepare('SELECT * FROM asientos WHERE id = ? AND empresa_id = ?')
    .get(id, empresaId) as Fila | undefined
}

/** La numeración se delega a la serie ASIENTO de `configuracion.repo`. */
export function insertarAsiento(db: Db, empresaId: number, datos: DatosAsiento): { id: number; numero: string } {
  const numero = nextSerieNumber(db, empresaId, 'ASIENTO')
  const resultado = db.prepare(`
    INSERT INTO asientos (empresa_id, numero, fecha, descripcion, tipo, periodo_id, estado, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, 'BORRADOR', ?)
  `).run(empresaId, numero, datos.fecha, datos.descripcion, datos.tipo, datos.periodoId, datos.usuarioId)
  return { id: Number(resultado.lastInsertRowid), numero }
}

export function insertarLineas(db: Db, asientoId: number, lineas: LineaAsiento[]): void {
  const insertar = db.prepare(`
    INSERT INTO asiento_lineas (asiento_id, cuenta_id, debe_centavos, haber_centavos, descripcion, orden)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  lineas.forEach((linea, indice) => {
    insertar.run(asientoId, linea.cuentaId, linea.debeCent, linea.haberCent, linea.descripcion, indice + 1)
  })
}

export function lineasDeAsiento(db: Db, empresaId: number, asientoId: number): Fila[] {
  return db.prepare(`
    SELECT l.*, c.codigo, c.nombre AS cuenta_nombre, c.tipo, c.naturaleza
    FROM asiento_lineas l
    JOIN plan_cuentas c ON c.id = l.cuenta_id AND c.empresa_id = ?
    WHERE l.asiento_id = ? AND EXISTS (
      SELECT 1 FROM asientos a WHERE a.id = l.asiento_id AND a.empresa_id = ?
    )
    ORDER BY l.orden, l.id
  `).all(empresaId, asientoId, empresaId) as Fila[]
}

export function actualizarEstadoAsiento(db: Db, empresaId: number, id: number, estado: string): number {
  return db.prepare(`
    UPDATE asientos SET estado = ?, actualizado_en = datetime('now')
    WHERE id = ? AND empresa_id = ?
  `).run(estado, id, empresaId).changes
}

export function sumasLineas(db: Db, asientoId: number): { debeCent: number; haberCent: number } {
  const fila = db.prepare(`
    SELECT COALESCE(SUM(debe_centavos), 0) AS debe, COALESCE(SUM(haber_centavos), 0) AS haber
    FROM asiento_lineas WHERE asiento_id = ?
  `).get(asientoId) as Fila
  return { debeCent: n(fila, 'debe'), haberCent: n(fila, 'haber') }
}

// ----------------------------------------------------------------- Reportes
export interface FiltroReporte {
  fechaDesde?: string
  fechaHasta?: string
  cuentaId?: number
  limite?: number
}

/** Líneas de asientos confirmados (los anulados nunca llegan a los reportes). */
export function lineasParaReporte(db: Db, empresaId: number, filtro: FiltroReporte = {}): Fila[] {
  const where = [
    'a.empresa_id = ?', 'c.empresa_id = ?', "a.estado = 'CONFIRMADO'", "a.estado <> 'ANULADO'"
  ]
  const args: unknown[] = [empresaId, empresaId]
  if (filtro.cuentaId !== undefined) { where.push('l.cuenta_id = ?'); args.push(filtro.cuentaId) }
  if (filtro.fechaDesde) { where.push('date(a.fecha) >= date(?)'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('date(a.fecha) <= date(?)'); args.push(filtro.fechaHasta) }
  return db.prepare(`
    SELECT a.id AS asiento_id, a.numero, a.fecha, a.descripcion AS asiento_descripcion, a.estado,
      l.id AS linea_id, l.cuenta_id, l.debe_centavos, l.haber_centavos,
      l.descripcion AS linea_descripcion, l.orden,
      c.codigo, c.nombre AS cuenta_nombre, c.tipo, c.naturaleza
    FROM asiento_lineas l
    JOIN asientos a ON a.id = l.asiento_id
    JOIN plan_cuentas c ON c.id = l.cuenta_id
    WHERE ${where.join(' AND ')}
    ORDER BY date(a.fecha), a.numero, l.orden, l.id
    LIMIT ?
  `).all(...args, filtro.limite ?? 1000) as Fila[]
}

/** Totales por cuenta para balances, ya con la condición de confirmado. */
export function resumenContable(db: Db, empresaId: number, filtro: FiltroReporte = {}): Fila[] {
  const where = [
    'a.empresa_id = ?', 'c.empresa_id = ?', "a.estado = 'CONFIRMADO'", "a.estado <> 'ANULADO'"
  ]
  const args: unknown[] = [empresaId, empresaId]
  if (filtro.fechaDesde) { where.push('date(a.fecha) >= date(?)'); args.push(filtro.fechaDesde) }
  if (filtro.fechaHasta) { where.push('date(a.fecha) <= date(?)'); args.push(filtro.fechaHasta) }
  return db.prepare(`
    SELECT c.id AS cuenta_id, c.codigo, c.nombre, c.tipo, c.naturaleza,
      COALESCE(SUM(l.debe_centavos), 0) AS debe_cent,
      COALESCE(SUM(l.haber_centavos), 0) AS haber_cent
    FROM asiento_lineas l
    JOIN asientos a ON a.id = l.asiento_id
    JOIN plan_cuentas c ON c.id = l.cuenta_id
    WHERE ${where.join(' AND ')}
    GROUP BY c.id, c.codigo, c.nombre, c.tipo, c.naturaleza
    ORDER BY c.codigo
  `).all(...args) as Fila[]
}

// -------------------------------------------------------------- Integración
/** Ventas confirmadas pendientes de asiento. Las ya integradas se detectan por el número en la descripción. */
export function documentosVentaParaIntegrar(
  db: Db, empresaId: number, filtro: { fechaDesde?: string; fechaHasta?: string; limite?: number } = {}
): Fila[] {
  return db.prepare(`
    SELECT d.*,
      CASE WHEN d.condicion = 'CONTADO' AND EXISTS (
        SELECT 1 FROM documento_pagos dp
        WHERE dp.doc_id = d.id AND dp.metodo = 'EFECTIVO'
      ) THEN 1 ELSE 0 END AS pago_efectivo
    FROM documentos_venta d
    WHERE d.empresa_id = ?
      AND d.estado IN ('ACTIVO', 'APROBADA', 'CONTABILIZADO')
      AND d.tipo IN ('FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS')
      AND d.total_cent > 0
      AND d.subtotal_cent + d.impuesto_cent = d.total_cent
      AND NOT EXISTS (
        SELECT 1 FROM asientos a
        WHERE a.empresa_id = d.empresa_id AND a.tipo = 'VENTA'
          AND a.estado <> 'ANULADO' AND instr(a.descripcion, d.numero) > 0
      )
      AND (? = '' OR date(d.fecha) >= date(?))
      AND (? = '' OR date(d.fecha) <= date(?))
    ORDER BY date(d.fecha), d.id
    LIMIT ?
  `).all(empresaId, filtro.fechaDesde ?? '', filtro.fechaDesde ?? '',
    filtro.fechaHasta ?? '', filtro.fechaHasta ?? '', filtro.limite ?? 200) as Fila[]
}

import type { Db } from '../db/connection'
import type { SessionContext } from './context'

/** Indicadores reales disponibles en Fase 3. Las cifras comerciales se añadirán en fases posteriores. */
export function createDashboardService(db: Db) {
  return {
    resumen(_ctx: SessionContext) {
      const count = (sql: string, ...args: unknown[]): number =>
        (db.prepare(sql).get(...args) as { n: number }).n
      return {
        usuariosActivos: count('SELECT COUNT(*) AS n FROM usuarios WHERE activo = 1'),
        empresasActivas: count('SELECT COUNT(*) AS n FROM empresas WHERE activa = 1'),
        roles: count('SELECT COUNT(*) AS n FROM roles'),
        impuestosActivos: count('SELECT COUNT(*) AS n FROM impuestos WHERE activo = 1'),
        seriesActivas: count('SELECT COUNT(*) AS n FROM series_documento WHERE activa = 1'),
        almacenes: count('SELECT COUNT(*) AS n FROM almacenes WHERE activo = 1'),
        cajas: count('SELECT COUNT(*) AS n FROM cajas WHERE activa = 1'),
        sesionesActivas: count('SELECT COUNT(*) AS n FROM sesiones WHERE fin IS NULL'),
        auditoriaHoy: count("SELECT COUNT(*) AS n FROM auditoria WHERE date(fecha) = date('now')"),
        pendiente: 'Las cifras comerciales, de inventario y financieras se consultan en Reportes (Fase 9); aquí se resumen entidades del sistema.'
      }
    }
  }
}

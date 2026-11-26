import type { Db } from '../db/connection'

export interface AuditContext {
  empresaId: number
  userId: number
  sesionId: number | null
}

/** Se llama DENTRO de la transacción de la operación auditada. */
export function writeAudit(
  db: Db,
  ctx: AuditContext,
  operacion: string,
  entidad: string,
  entidadId: string | number | null,
  antes: unknown = null,
  despues: unknown = null
): void {
  db.prepare(`
    INSERT INTO auditoria (empresa_id, usuario_id, sesion_id, operacion, entidad, entidad_id, valores_antes, valores_despues)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ctx.empresaId, ctx.userId, ctx.sesionId, operacion, entidad,
    entidadId === null ? null : String(entidadId),
    antes === null ? null : JSON.stringify(antes),
    despues === null ? null : JSON.stringify(despues)
  )
}

export interface AuditFilter {
  fechaDesde?: string
  fechaHasta?: string
  usuarioId?: number
  entidad?: string
  entidadId?: string
  operacion?: string
  texto?: string
}

export function listAudit(db: Db, empresaId: number, filter: AuditFilter): Record<string, unknown>[] {
  const where = ['a.empresa_id = ?']
  const args: unknown[] = [empresaId]
  if (filter.fechaDesde) { where.push('a.fecha >= ?'); args.push(filter.fechaDesde) }
  if (filter.fechaHasta) { where.push('a.fecha <= ?'); args.push(filter.fechaHasta) }
  if (filter.usuarioId) { where.push('a.usuario_id = ?'); args.push(filter.usuarioId) }
  if (filter.entidad) { where.push('a.entidad = ?'); args.push(filter.entidad) }
  if (filter.entidadId) { where.push('a.entidad_id = ?'); args.push(filter.entidadId) }
  if (filter.operacion) { where.push('a.operacion LIKE ?'); args.push(`%${filter.operacion}%`) }
  if (filter.texto) {
    where.push(`(
      a.entidad LIKE ? OR a.operacion LIKE ? OR COALESCE(a.entidad_id, '') LIKE ?
      OR COALESCE(a.valores_antes, '') LIKE ? OR COALESCE(a.valores_despues, '') LIKE ?
      OR COALESCE(u.username, '') LIKE ?
    )`)
    const patron = `%${filter.texto}%`
    args.push(patron, patron, patron, patron, patron, patron)
  }
  return db.prepare(`
    SELECT a.*, u.username FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 500
  `).all(...args) as Record<string, unknown>[]
}

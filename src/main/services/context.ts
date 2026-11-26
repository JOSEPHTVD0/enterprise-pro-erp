import type { Db } from '../db/connection'
import { errors } from '@shared/errors'
import { hashToken } from '../core/password'
import * as repo from '../repositories/seguridad.repo'
import type { SessionContext } from '@shared/session'

export type { SessionContext } from '@shared/session'
import type { PublicSessionContext } from '@shared/session'

/** Elimina el token antes de cruzar el contextoBridge hacia el renderer. */
export function contextoPublico(ctx: SessionContext): PublicSessionContext {
  const publico: Partial<SessionContext> = { ...ctx }
  delete publico.token
  return publico as PublicSessionContext
}

export const INACTIVITY_MINUTES = 30
export const ABSOLUTE_HOURS = 12
export const MAX_FAILED_ATTEMPTS = 5

/** Verifica permiso del contexto. Se invoca en el backend, nunca solo en la UI. */
export function requirePermission(ctx: SessionContext, key: string): void {
  if (!ctx.permisos.includes(key)) throw errors.forbidden()
}

/** Contexto fresco en cada llamada: cambios de permisos/roles aplican de inmediato. */
export function buildContext(db: Db, token: string): SessionContext {
  const tokenHash = hashToken(token)
  const session = repo.findActiveSession(db, tokenHash)
  if (!session) throw errors.unauthorized()

  const last = new Date(`${session.ultima_actividad.replace(' ', 'T')}Z`).getTime()
  const start = new Date(`${session.inicio.replace(' ', 'T')}Z`).getTime()
  const now = Date.now()
  if (!Number.isFinite(last) || now - last > INACTIVITY_MINUTES * 60_000 || now - start > ABSOLUTE_HOURS * 3_600_000) {
    repo.closeSession(db, session.id)
    throw errors.unauthorized()
  }
  const user = repo.findUserById(db, session.usuario_id)
  if (!user || !user.activo || user.bloqueado) throw errors.unauthorized()

  repo.touchSession(db, session.id)
  const roleIds = repo.roleIdsForUser(db, user.id, session.empresa_id)
  const permisos = repo.effectivePermissions(db, roleIds, user.id)
    .filter((p) => p.concedido === 1)
    .map((p) => p.key)

  return {
    token,
    sesionId: session.id,
    userId: user.id,
    empresaId: session.empresa_id,
    username: user.username,
    nombre: user.nombre,
    empresaNombre: repo.companyName(db, session.empresa_id),
    debeCambiarClave: user.debe_cambiar_clave === 1,
    permisos,
    iniciaEn: session.inicio,
    ultimaActividad: session.ultima_actividad
  }
}

import { DomainError } from '@shared/errors'
import type { SessionContext } from '@shared/session'

/** Canales disponibles mientras el usuario aún no cambió su contraseña inicial. */
const cambioClaveAllowlist = new Set(['auth.me', 'auth.logout', 'auth.changePassword'])

/** Se ejecuta en el router, después de construir el contexto y antes del permiso. */
export function assertCanProceed(ctx: SessionContext, channel: string): void {
  if (ctx.debeCambiarClave && !cambioClaveAllowlist.has(channel)) {
    throw new DomainError(
      'PASSWORD_CHANGE_REQUIRED',
      'Debe cambiar su contraseña antes de continuar.'
    )
  }
}

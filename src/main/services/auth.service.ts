import { randomBytes } from 'node:crypto'
import type { Db } from '../db/connection'
import { hashPassword, hashToken, temporaryPassword, verifyPassword } from '../core/password'
import { writeAudit } from '../repositories/auditoria.repo'
import * as repo from '../repositories/seguridad.repo'
import { buildContext, MAX_FAILED_ATTEMPTS, type SessionContext } from './context'
import { DomainError, errors, SelectCompanyError } from '@shared/errors'
import type { LoginInput } from '@shared/schemas/auth'

export interface LoginResult {
  token?: string
  context?: SessionContext
  debeCambiarClave?: boolean
  empresas?: { id: number; nombre: string }[]
}

export function createAuthService(db: Db) {
  return {
    login(input: LoginInput, equipo: string): LoginResult {
      const user = repo.findUserByUsername(db, input.username)
      if (!user) throw new DomainError('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.')

      if (user.bloqueado) throw new DomainError('ACCOUNT_BLOCKED', 'Usuario bloqueado. Contacte al administrador.')
      if (!user.activo) throw new DomainError('ACCOUNT_INACTIVE', 'Usuario desactivado.')

      if (!verifyPassword(input.password, user.password_hash, user.salt)) {
        const attempts = user.intentos_fallidos + 1
        repo.registerFailedAttempt(db, user.id, attempts, attempts >= MAX_FAILED_ATTEMPTS)
        throw new DomainError('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.')
      }
      repo.clearFailedAttempts(db, user.id)

      const companies = repo.userCompanies(db, user.id)
      if (!companies.length) throw new DomainError('NO_COMPANY', 'El usuario no tiene empresas asignadas.')
      if (!input.empresaId && companies.length > 1) throw new SelectCompanyError(companies)
      const empresaId = input.empresaId ?? companies[0].id
      if (!companies.some((c) => c.id === empresaId)) throw errors.forbidden()

      const result = db.transaction(() => {
        const token = randomBytes(32).toString('base64url')
        const sesionId = repo.insertSession(db, hashToken(token), user.id, empresaId, equipo)
        writeAudit(db, { empresaId, userId: user.id, sesionId }, 'LOGIN', 'usuarios', user.id)
        return { token, sesionId }
      })()

      return {
        token: result.token,
        context: buildContext(db, result.token),
        debeCambiarClave: user.debe_cambiar_clave === 1,
        empresas: companies
      }
    },

    me(token: string): SessionContext {
      return buildContext(db, token)
    },

    /** Empresas autorizadas para el usuario de una sesión ya autenticada. */
    userCompanies(userId: number): { id: number; nombre: string }[] {
      return repo.userCompanies(db, userId)
    },

    /**
     * Cambio rápido de empresa sin volver a pedir contraseña. Cierra la sesión
     * anterior y abre una nueva con token distinto; ambas operaciones quedan
     * auditadas y se comprueba de nuevo la pertenencia del usuario.
     */
    switchCompany(ctx: SessionContext, empresaId: number, equipo: string): LoginResult {
      const companies = repo.userCompanies(db, ctx.userId)
      if (!companies.some((c) => c.id === empresaId)) throw errors.forbidden()
      if (empresaId === ctx.empresaId) return {
        token: undefined, context: ctx, debeCambiarClave: ctx.debeCambiarClave, empresas: companies
      }
      const token = db.transaction(() => {
        writeAudit(db, {
          empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
        }, 'LOGOUT', 'sesiones', ctx.sesionId)
        repo.closeSession(db, ctx.sesionId)
        const nuevoToken = randomBytes(32).toString('base64url')
        const sesionId = repo.insertSession(db, hashToken(nuevoToken), ctx.userId, empresaId, equipo)
        writeAudit(db, { empresaId, userId: ctx.userId, sesionId }, 'LOGIN', 'usuarios', ctx.userId)
        return nuevoToken
      })()
      return {
        token,
        context: buildContext(db, token),
        debeCambiarClave: ctx.debeCambiarClave,
        empresas: companies
      }
    },

    logout(ctx: SessionContext): void {
      db.transaction(() => {
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'LOGOUT', 'sesiones', ctx.sesionId)
        repo.closeSession(db, ctx.sesionId)
      })()
    },

    changePassword(ctx: SessionContext, currentPassword: string, newPassword: string): void {
      const user = repo.findUserById(db, ctx.userId)
      if (!user || !verifyPassword(currentPassword, user.password_hash, user.salt)) {
        throw new DomainError('INVALID_PASSWORD', 'La contraseña actual es incorrecta.')
      }
      if (verifyPassword(newPassword, user.password_hash, user.salt)) {
        throw errors.validation('La nueva contraseña debe ser diferente de la actual.')
      }
      const { hash, salt } = hashPassword(newPassword)
      db.transaction(() => {
        repo.setPassword(db, user.id, hash, salt, false)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'CAMBIAR_CLAVE', 'usuarios', user.id)
      })()
    },

    resetPassword(ctx: SessionContext, userId: number): string {
      if (!ctx.permisos.includes('seguridad.usuario.restablecer')) throw errors.forbidden()
      if (!repo.userBelongsToCompany(db, userId, ctx.empresaId)) throw errors.notFound('Usuario')
      const temporary = temporaryPassword()
      const { hash, salt } = hashPassword(temporary)
      db.transaction(() => {
        repo.setPassword(db, userId, hash, salt, true)
        repo.setUserFlags(db, userId, { bloqueado: false })
        repo.closeUserSessions(db, userId)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'RESTABLECER_CLAVE', 'usuarios', userId)
      })()
      // La contraseña temporal se devuelve una sola vez al administrador.
      return temporary
    }
  }
}

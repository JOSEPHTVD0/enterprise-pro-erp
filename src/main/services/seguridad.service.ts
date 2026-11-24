import type { Db } from '../db/connection'
import { hashPassword, temporaryPassword } from '../core/password'
import { writeAudit, listAudit, type AuditFilter } from '../repositories/auditoria.repo'
import * as repo from '../repositories/seguridad.repo'
import { requirePermission, type SessionContext } from './context'
import { errors } from '@shared/errors'
import { permissionCatalog, permissionKeys } from '@shared/permissions'
import type { CreateRoleInput, CreateUserInput, UpdateUserInput } from '@shared/schemas/auth'

export function createSeguridadService(db: Db) {
  return {
    listUsers(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return repo.listUsers(db)
    },

    getUser(ctx: SessionContext, userId: number) {
      requirePermission(ctx, 'seguridad.consultar')
      const user = repo.findUserById(db, userId)
      if (!user) throw errors.notFound('Usuario')
      return { id: user.id, username: user.username, nombre: user.nombre, roles: repo.rolesForUser(db, userId) }
    },

    createUser(ctx: SessionContext, input: CreateUserInput) {
      requirePermission(ctx, 'seguridad.crear')
      if (repo.findUserByUsername(db, input.username)) throw errors.conflict('El nombre de usuario ya existe.')
      for (const r of input.roles) {
        if (!repo.findRole(db, r.empresaId, r.rolId)) throw errors.validation('Uno de los roles no existe para la empresa indicada.')
      }
      const temp = temporaryPassword()
      const { hash, salt } = hashPassword(temp)
      const id = db.transaction(() => {
        const userId = repo.insertUser(db, {
          username: input.username, nombre: input.nombre, email: input.email,
          hash, salt, departamentoId: input.departamentoId ?? null, activo: input.activo
        })
        repo.replaceUserRoles(db, userId, input.roles)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'CREAR', 'usuarios', userId, null, input)
        return userId
      })()
      return { id, contrasenaInicial: temp }
    },

    updateUser(ctx: SessionContext, input: UpdateUserInput) {
      requirePermission(ctx, 'seguridad.modificar')
      const user = repo.findUserById(db, input.id)
      if (!user) throw errors.notFound('Usuario')
      db.transaction(() => {
        repo.updateUser(db, input.id, {
          nombre: input.nombre, email: input.email,
          departamentoId: input.departamentoId ?? null, activo: input.activo
        })
        repo.replaceUserRoles(db, input.id, input.roles)
        if (!input.activo) repo.closeUserSessions(db, input.id)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'MODIFICAR', 'usuarios', input.id, user, input)
      })()
      return { ok: true }
    },

    setUserStatus(ctx: SessionContext, userId: number, field: 'activo' | 'bloqueado', value: boolean) {
      requirePermission(ctx, field === 'bloqueado' ? 'seguridad.usuario.bloquear' : 'seguridad.modificar')
      const user = repo.findUserById(db, userId)
      if (!user) throw errors.notFound('Usuario')
      if (field === 'bloqueado' && userId === ctx.userId) throw errors.validation('No puede bloquear su propio usuario.')
      if (field === 'activo' && userId === ctx.userId) throw errors.validation('No puede desactivar su propio usuario.')
      db.transaction(() => {
        repo.setUserFlags(db, userId, { [field]: value })
        if (!value) repo.closeUserSessions(db, userId)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, field === 'bloqueado' ? 'BLOQUEAR' : 'DESACTIVAR', 'usuarios', userId, { [field]: !value }, { [field]: value })
      })()
      return { ok: true }
    },

    listRoles(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return repo.listRoles(db, ctx.empresaId)
    },

    listPermissions(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return permissionCatalog
    },

    getRole(ctx: SessionContext, roleId: number) {
      requirePermission(ctx, 'seguridad.consultar')
      const role = repo.findRole(db, ctx.empresaId, roleId)
      if (!role) throw errors.notFound('Rol')
      return { ...role, permisos: repo.permissionKeysForRole(db, roleId) }
    },

    createRole(ctx: SessionContext, input: CreateRoleInput) {
      requirePermission(ctx, 'seguridad.crear')
      const id = db.transaction(() => {
        const roleId = repo.insertRole(db, ctx.empresaId, input.nombre, input.descripcion)
        repo.setRolePermissions(db, roleId, input.permisos.filter((p) => permissionKeys.includes(p)))
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'CREAR', 'roles', roleId, null, input)
        return roleId
      })()
      return { id }
    },

    updateRole(ctx: SessionContext, input: { id: number; nombre: string; descripcion: string; permisos: string[] }) {
      requirePermission(ctx, 'seguridad.permiso.modificar')
      const role = repo.findRole(db, ctx.empresaId, input.id)
      if (!role) throw errors.notFound('Rol')
      if (role.nombre === 'Administrador') throw errors.validation('El rol Administrador no se puede modificar: siempre tiene acceso total.')
      db.transaction(() => {
        repo.updateRole(db, input.id, input.nombre, input.descripcion)
        repo.setRolePermissions(db, input.id, input.permisos.filter((p) => permissionKeys.includes(p)))
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'MODIFICAR', 'roles', input.id, role, input)
      })()
      return { ok: true }
    },

    listDepartments(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return repo.listDepartments(db, ctx.empresaId)
    },

    createDepartment(ctx: SessionContext, nombre: string) {
      requirePermission(ctx, 'seguridad.crear')
      const exists = db.prepare('SELECT 1 FROM departamentos WHERE empresa_id = ? AND nombre = ?').get(ctx.empresaId, nombre)
      if (exists) throw errors.conflict('El departamento ya existe.')
      const id = db.transaction(() => {
        const res = db.prepare('INSERT INTO departamentos (empresa_id, nombre) VALUES (?, ?)').run(ctx.empresaId, nombre)
        const did = Number(res.lastInsertRowid)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'CREAR', 'departamentos', did, null, { nombre })
        return did
      })()
      return { id }
    },

    listSessions(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.sesion.consultar')
      return repo.listSessions(db, ctx.empresaId)
    },

    listAudit(ctx: SessionContext, filter: AuditFilter) {
      requirePermission(ctx, 'auditoria.consultar')
      return listAudit(db, ctx.empresaId, filter)
    }
  }
}

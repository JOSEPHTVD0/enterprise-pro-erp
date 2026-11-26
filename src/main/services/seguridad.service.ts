import type { Db } from '../db/connection'
import { hashPassword, temporaryPassword } from '../core/password'
import { writeAudit, listAudit, type AuditFilter } from '../repositories/auditoria.repo'
import * as repo from '../repositories/seguridad.repo'
import { requirePermission, type SessionContext } from './context'
import { errors } from '@shared/errors'
import {
  customPermissionKeyPattern, modules as modulosSistema, moduleLabels,
  permissionCatalog, permissionCriticalKeys, permissionKeys, type ModuleKey, type PermissionDef
} from '@shared/permissions'
import type {
  CreateRoleInput, CreateUserInput, CustomPermissionInput, RolePermissionsReplaceInput, UpdateUserInput
} from '@shared/schemas/auth'

const clavesDelSistema = new Set(permissionKeys)
const criticos = new Set(permissionCriticalKeys)
const permisosDeGestion = ['seguridad.consultar', 'seguridad.permiso.modificar']
const modulosValidos = new Set<string>(modulosSistema)

export function createSeguridadService(db: Db) {
  /** Catálogo real del sistema más los permisos creados para la empresa activa. */
  function catalogoCompleto(ctx: SessionContext): PermissionDef[] {
    const personalizados = repo.listCustomPermissions(db, ctx.empresaId).map((p) => ({
      key: p.clave,
      module: (modulosValidos.has(p.modulo) ? p.modulo : 'configuracion') as ModuleKey,
      operation: p.operacion || 'personalizado',
      label: p.etiqueta,
      descripcion: p.descripcion || `Permiso personalizado de ${moduleLabels[(modulosValidos.has(p.modulo) ? p.modulo : 'configuracion') as ModuleKey]}.`,
      critico: p.critico === 1,
      personalizado: true
    }))
    return [...permissionCatalog, ...personalizados]
  }

  function validarEmpresa(ctx: SessionContext, userId: number): void {
    if (!repo.userBelongsToCompany(db, userId, ctx.empresaId)) throw errors.notFound('Usuario')
  }

  function validarDependencias(ctx: SessionContext, input: { departamentoId?: number | null; roles: { rolId: number; empresaId: number }[] }): void {
    if (input.departamentoId && !repo.findDepartment(db, ctx.empresaId, input.departamentoId)) {
      throw errors.validation('El departamento no pertenece a la empresa activa.')
    }
    for (const r of input.roles) {
      if (r.empresaId !== ctx.empresaId) throw errors.validation('Uno de los roles no pertenece a la empresa activa.')
      if (!repo.findRole(db, ctx.empresaId, r.rolId)) throw errors.validation('Uno de los roles no existe para la empresa activa.')
    }
  }

  function validarClaves(ctx: SessionContext, keys: string[]): void {
    const permitidas = new Set<string>([
      ...clavesDelSistema,
      ...repo.listCustomPermissions(db, ctx.empresaId).map((p) => p.clave)
    ])
    for (const clave of keys) {
      if (!permitidas.has(clave)) {
        throw errors.validation(`Permiso no disponible para esta empresa: ${clave}`)
      }
    }
  }

  return {
    listUsers(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return repo.listUsers(db, ctx.empresaId)
    },

    getUser(ctx: SessionContext, userId: number) {
      requirePermission(ctx, 'seguridad.consultar')
      validarEmpresa(ctx, userId)
      const user = repo.findUserById(db, userId)!
      return {
        id: user.id, username: user.username, nombre: user.nombre,
        roles: repo.rolesForUser(db, userId, ctx.empresaId)
      }
    },

    createUser(ctx: SessionContext, input: CreateUserInput) {
      requirePermission(ctx, 'seguridad.crear')
      if (repo.findUserByUsername(db, input.username)) throw errors.conflict('El nombre de usuario ya existe.')
      validarDependencias(ctx, input)
      const temp = temporaryPassword()
      const { hash, salt } = hashPassword(temp)
      const id = db.transaction(() => {
        const userId = repo.insertUser(db, {
          username: input.username, nombre: input.nombre, email: input.email,
          hash, salt, departamentoId: input.departamentoId ?? null, activo: input.activo
        })
        repo.replaceUserRoles(db, userId, input.roles, ctx.empresaId)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'CREAR', 'usuarios', userId, null, input)
        return userId
      })()
      return { id, contrasenaInicial: temp }
    },

    updateUser(ctx: SessionContext, input: UpdateUserInput) {
      requirePermission(ctx, 'seguridad.modificar')
      validarEmpresa(ctx, input.id)
      validarDependencias(ctx, input)
      const user = repo.findUserById(db, input.id)!
      db.transaction(() => {
        repo.updateUser(db, input.id, {
          nombre: input.nombre, email: input.email,
          departamentoId: input.departamentoId ?? null, activo: input.activo
        })
        repo.replaceUserRoles(db, input.id, input.roles, ctx.empresaId)
        if (!input.activo) repo.closeUserSessions(db, input.id)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'MODIFICAR', 'usuarios', input.id, user, input)
      })()
      return { ok: true }
    },

    setUserStatus(ctx: SessionContext, userId: number, field: 'activo' | 'bloqueado', value: boolean) {
      requirePermission(ctx, field === 'bloqueado' ? 'seguridad.usuario.bloquear' : 'seguridad.modificar')
      validarEmpresa(ctx, userId)
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
      return catalogoCompleto(ctx)
    },

    /** Catálogo completo con la explicación de para qué sirve cada permiso. */
    permissionCatalog(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return catalogoCompleto(ctx)
    },

    listCustomPermissions(ctx: SessionContext) {
      requirePermission(ctx, 'seguridad.consultar')
      return repo.listCustomPermissions(db, ctx.empresaId)
    },

    /**
     * Crea o edita un permiso `custom.*` de la empresa. Es una etiqueta auditada
     * que puede asignarse a roles; nunca habilita rutas del sistema por sí sola.
     */
    saveCustomPermission(ctx: SessionContext, input: CustomPermissionInput) {
      requirePermission(ctx, 'seguridad.permiso.modificar')
      if (!customPermissionKeyPattern.test(input.key)) throw errors.validation('Clave de permiso personalizado inválida.')
      if (!modulosValidos.has(input.module)) throw errors.validation('Módulo desconocido.')
      const existente = repo.findPermissionByKey(db, input.key)
      if (existente && (!existente.personalizado || existente.empresa_id !== ctx.empresaId)) {
        throw errors.conflict('Ya existe un permiso con esa clave.')
      }
      const id = db.transaction(() => {
        let permisoId: number
        if (existente) {
          repo.updateCustomPermission(db, existente.id, {
            etiqueta: input.label,
            descripcion: input.descripcion,
            modulo: input.module,
            critico: input.critico
          })
          permisoId = existente.id
        } else {
          permisoId = repo.insertCustomPermission(db, {
            clave: input.key,
            modulo: input.module,
            etiqueta: input.label,
            descripcion: input.descripcion,
            critico: input.critico,
            empresaId: ctx.empresaId
          })
          repo.grantPermissionToAdmin(db, ctx.empresaId, permisoId)
        }
        writeAudit(
          db,
          { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
          existente ? 'MODIFICAR' : 'CREAR', 'permisos', permisoId,
          existente ?? null, input
        )
        return permisoId
      })()
      return { id }
    },

    deleteCustomPermission(ctx: SessionContext, key: string) {
      requirePermission(ctx, 'seguridad.permiso.modificar')
      const permiso = repo.findPermissionByKey(db, key)
      if (!permiso || !permiso.personalizado || permiso.empresa_id !== ctx.empresaId) {
        throw errors.notFound('Permiso personalizado')
      }
      db.transaction(() => {
        repo.deleteCustomPermission(db, permiso.id)
        writeAudit(
          db,
          { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
          'ELIMINAR', 'permisos', permiso.id, permiso, { clave: key }
        )
      })()
      return { ok: true }
    },

    getRolePermissions(ctx: SessionContext, roleId: number) {
      requirePermission(ctx, 'seguridad.consultar')
      const role = repo.findRole(db, ctx.empresaId, roleId)
      if (!role) throw errors.notFound('Rol')
      const porClave = new Map(catalogoCompleto(ctx).map((p) => [p.key, p]))
      const permisos = repo.permissionKeysForRole(db, roleId)
        .map((key) => porClave.get(key))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
      return {
        id: role.id,
        nombre: role.nombre,
        descripcion: role.descripcion,
        bloqueado: role.nombre === 'Administrador',
        permisos
      }
    },

    /**
     * Reemplaza los permisos de un rol dentro de una transacción. Audita el diff,
     * exige confirmación para permisos críticos y evita quedarse sin gestión.
     */
    replaceRolePermissions(ctx: SessionContext, input: RolePermissionsReplaceInput) {
      requirePermission(ctx, 'seguridad.permiso.modificar')
      validarClaves(ctx, input.permisos)
      const criticosAplicables = new Set([
        ...criticos,
        ...repo.listCustomPermissions(db, ctx.empresaId).filter((p) => p.critico === 1).map((p) => p.clave)
      ])
      const resultado = db.transaction(() => {
        const role = repo.findRole(db, ctx.empresaId, input.rolId)
        if (!role) throw errors.notFound('Rol')
        if (role.nombre === 'Administrador') {
          throw errors.validation('El rol Administrador siempre tiene acceso total y no se puede editar.')
        }

        const anteriores = new Set(repo.permissionKeysForRole(db, input.rolId))
        const nuevos = new Set(input.permisos)
        const agregados = [...nuevos].filter((k) => !anteriores.has(k))
        const removidos = [...anteriores].filter((k) => !nuevos.has(k))

        if (agregados.some((k) => criticosAplicables.has(k)) && !input.confirmarCriticos) {
          throw errors.validation('Los permisos críticos requieren confirmación explícita antes de guardar.')
        }
        for (const clave of permisosDeGestion) {
          if (anteriores.has(clave) && removidos.includes(clave) &&
              repo.countRolesWithPermission(db, ctx.empresaId, clave, input.rolId) === 0) {
            throw errors.validation(`Debe conservar otro rol activo con ${clave} para no perder la administración.`)
          }
        }

        repo.setRolePermissions(db, input.rolId, input.permisos)
        writeAudit(
          db,
          { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId },
          'MODIFICAR', 'rol_permisos', input.rolId,
          { permisos: [...anteriores] },
          { permisos: input.permisos, agregados, removidos, motivo: input.motivo }
        )
        return { ok: true, agregados, removidos }
      })()
      return resultado
    },

    getRole(ctx: SessionContext, roleId: number) {
      requirePermission(ctx, 'seguridad.consultar')
      const role = repo.findRole(db, ctx.empresaId, roleId)
      if (!role) throw errors.notFound('Rol')
      return { ...role, permisos: repo.permissionKeysForRole(db, roleId) }
    },

    createRole(ctx: SessionContext, input: CreateRoleInput) {
      requirePermission(ctx, 'seguridad.crear')
      validarClaves(ctx, input.permisos)
      if (input.nombre.toLowerCase() === 'administrador') {
        throw errors.validation('El nombre Administrador está reservado para el rol con acceso total.')
      }
      const id = db.transaction(() => {
        if (repo.findRoleByName(db, ctx.empresaId, input.nombre)) {
          throw errors.conflict('Ya existe un rol con ese nombre.')
        }
        const roleId = repo.insertRole(db, ctx.empresaId, input.nombre, input.descripcion)
        repo.setRolePermissions(db, roleId, input.permisos)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'CREAR', 'roles', roleId, null, input)
        return roleId
      })()
      return { id }
    },

    updateRole(ctx: SessionContext, input: { id: number; nombre: string; descripcion: string; permisos: string[] }) {
      requirePermission(ctx, 'seguridad.permiso.modificar')
      validarClaves(ctx, input.permisos)
      const role = repo.findRole(db, ctx.empresaId, input.id)
      if (!role) throw errors.notFound('Rol')
      if (role.nombre === 'Administrador') throw errors.validation('El rol Administrador no se puede modificar: siempre tiene acceso total.')
      if (input.nombre.toLowerCase() === 'administrador') {
        throw errors.validation('El nombre Administrador está reservado para el rol con acceso total.')
      }
      db.transaction(() => {
        repo.updateRole(db, input.id, input.nombre, input.descripcion)
        repo.setRolePermissions(db, input.id, input.permisos)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'MODIFICAR', 'roles', input.id, role, input)
      })()
      return { ok: true }
    },

    deleteRole(ctx: SessionContext, roleId: number) {
      requirePermission(ctx, 'seguridad.rol.eliminar')
      const role = repo.findRole(db, ctx.empresaId, roleId)
      if (!role) throw errors.notFound('Rol')
      const nombre = String(role.nombre)
      if (['Administrador', 'Gerente', 'Vendedor'].includes(nombre)) {
        throw errors.validation(`El rol ${nombre} es del sistema y no se puede eliminar.`)
      }
      const asignados = Number((db.prepare(`
        SELECT COUNT(*) AS n FROM usuario_roles WHERE rol_id = ? AND empresa_id = ?
      `).get(roleId, ctx.empresaId) as { n: number }).n)
      if (asignados > 0) {
        throw errors.conflict(`El rol tiene ${asignados} usuario(s) asignado(s); quítelos antes de eliminarlo.`)
      }
      db.transaction(() => {
        db.prepare(`
          DELETE FROM ajustes_personalizados WHERE empresa_id = ? AND ambito = 'ROL' AND objetivo = ?
        `).run(ctx.empresaId, String(roleId))
        db.prepare('DELETE FROM roles WHERE id = ? AND empresa_id = ?').run(roleId, ctx.empresaId)
        writeAudit(db, { empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId }, 'ELIMINAR', 'roles', roleId, role, null)
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
    },

    /** Cierre forzado de una sesión ajena, auditado y limitado a la empresa activa. */
    closeSession(ctx: SessionContext, sesionId: number) {
      requirePermission(ctx, 'seguridad.usuario.bloquear')
      if (sesionId === ctx.sesionId) throw errors.validation('Use «Cerrar sesión» para finalizar la suya.')
      const sesion = db.prepare('SELECT id, empresa_id FROM sesiones WHERE id = ? AND fin IS NULL')
        .get(sesionId) as { id: number; empresa_id: number } | undefined
      if (!sesion || sesion.empresa_id !== ctx.empresaId) throw errors.notFound('Sesión')
      db.transaction(() => {
        repo.closeSession(db, sesionId)
        writeAudit(db, {
          empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
        }, 'BLOQUEAR', 'sesiones', sesionId, { abierta: true }, { abierta: false })
      })()
      return { ok: true }
    }
  }
}

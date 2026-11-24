import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { hashPassword, hashToken, temporaryPassword, verifyPassword } from '../../src/main/core/password'
import { serializeError, DomainError, errors, encodeIpcError, decodeIpcError } from '@shared/errors'
import { permissionCatalog, permissionKeys, seedRoles } from '@shared/permissions'
import { changePasswordSchema } from '@shared/schemas/auth'
import { assertCanProceed } from '../../src/main/ipc/policy'
import type { SessionContext } from '@shared/session'
import { empresaSchema, impuestoSchema, serieSchema, backupConfigSchema } from '@shared/schemas/config'

const sessionBase = {
  token: 't', sesionId: 1, userId: 1, empresaId: 1, username: 'admin',
  nombre: 'Admin', empresaNombre: 'Empresa', permisos: []
}

describe('hash y tokens', () => {
  it('usa salt único y verificación correcta', () => {
    const a = hashPassword('ClaveSegura123!')
    const b = hashPassword('ClaveSegura123!')
    expect(a.hash).not.toBe(b.hash)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toContain('ClaveSegura')
    expect(verifyPassword('ClaveSegura123!', a.hash, a.salt)).toBe(true)
    expect(verifyPassword('incorrecta', a.hash, a.salt)).toBe(false)
  })

  it('hashea tokens de sesión de forma determinista', () => {
    const token = 'token-de-prueba'
    const hash = hashToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).toBe(hash)
    expect(hash).not.toBe(token)
  })

  it('la contraseña temporal cumple la política de seguridad', () => {
    const temp = temporaryPassword()
    expect(() => changePasswordSchema.parse({ currentPassword: 'x', newPassword: temp })).not.toThrow()
  })
})

describe('serialización de errores IPC', () => {
  it('conserva el código de error al cruzar el puente IPC', () => {
    const original = { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debe cambiar su contraseña.', data: { paso: 1 } }
    expect(decodeIpcError(encodeIpcError(original))).toEqual(original)
    const prefixed = new Error(`Error invoking remote method 'config.get': Error: ${encodeIpcError(original).message}`)
    expect(decodeIpcError(prefixed)).toEqual(original)
    expect(decodeIpcError(new Error('otro error'))).toBeNull()
    expect(decodeIpcError({ code: 'X', message: 'Y' })).toBeNull()
  })

  it('bloquea el acceso a otros canales mientras se debe cambiar la clave', () => {
    const ctx: SessionContext = { ...sessionBase, debeCambiarClave: true }
    const serialized = serializeError((() => {
      try { assertCanProceed(ctx, 'config.get') } catch (e) { return e }
    })())
    expect(serialized.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('convierte errores Zod en mensajes accionables', () => {
    const parsed = empresaSchema.safeParse({ nombreComercial: 'Empresa', razonSocial: 'Empresa SRL', rnc: 'abc' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const serialized = serializeError(parsed.error)
    expect(serialized.code).toBe('VALIDATION')
    expect(serialized.message).toContain('rnc')
  })

  it('no filtra detalles internos en errores desconocidos', () => {
    expect(serializeError(new Error('secreto')).message).toBe('secreto')
    expect(serializeError({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY', message: 'duplicado' }).code).toBe('CONFLICT')
    expect(serializeError(errors.forbidden()).code).toBe('FORBIDDEN')
    expect(serializeError(new DomainError('X', 'Y')).message).toBe('Y')
  })
})

describe('política de cambio obligatorio de contraseña', () => {
  it('bloquea todas las operaciones salvo las de cambio de clave, me y logout', () => {
    const ctx: SessionContext = { ...sessionBase, debeCambiarClave: true }
    expect(() => assertCanProceed(ctx, 'config.get')).toThrowError('Debe cambiar su contraseña')
    expect(() => assertCanProceed(ctx, 'seguridad.users.list')).toThrow()
    expect(() => assertCanProceed(ctx, 'auth.changePassword')).not.toThrow()
    expect(() => assertCanProceed(ctx, 'auth.me')).not.toThrow()
    expect(() => assertCanProceed(ctx, 'auth.logout')).not.toThrow()
  })

  it('no bloquea cuando la clave ya fue cambiada', () => {
    const ctx: SessionContext = { ...sessionBase, debeCambiarClave: false }
    expect(() => assertCanProceed(ctx, 'config.get')).not.toThrow()
  })
})

describe('catálogo de permisos y esquemas', () => {
  it('no hay permisos duplicados y Administrador cubre todos', () => {
    expect(new Set(permissionKeys).size).toBe(permissionKeys.length)
    const admin = seedRoles.find((r) => r.name === 'Administrador')
    expect(admin).toBeTruthy()
    expect(permissionKeys.filter(admin!.permissionFilter).length).toBe(permissionKeys.length)
    expect(permissionCatalog.every((p) => p.label.length > 0)).toBe(true)
  })

  it('rechaza configuración inválida antes de llegar a la base de datos', () => {
    expect(() => impuestoSchema.parse({ codigo: 'ITBIS18', descripcion: 'x', tasaBp: 20000 })).toThrow(ZodError)
    expect(() => serieSchema.parse({ tipoDoc: 'FACTURA_CONTADO', siguiente: 0 })).toThrow(ZodError)
    expect(() => backupConfigSchema.parse({ carpeta: '', frecuencia: 'ANUAL' })).toThrow(ZodError)
  })
})

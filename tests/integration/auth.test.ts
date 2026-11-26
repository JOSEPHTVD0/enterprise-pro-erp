import { describe, it, expect } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD, seed } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createSeguridadService } from '../../src/main/services/seguridad.service'
import { buildContext } from '../../src/main/services/context'
import { permissionKeys } from '@shared/permissions'

describe('migraciones y datos estructurales', () => {
  it('crea todas las tablas y migraciones aplicadas', () => {
    const db = testDb()
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    for (const t of ['empresas', 'usuarios', 'roles', 'permisos', 'sesiones', 'auditoria', 'series_documento', 'impuestos', 'almacenes', 'cajas', 'plan_cuentas', 'periodos_contables', 'asientos', 'asiento_lineas']) {
      expect(tables).toContain(t)
    }
    const versions = (db.prepare('SELECT version FROM _migraciones ORDER BY version').all() as { version: number }[])
      .map((m) => m.version)
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    db.close()
  })

  it('siembra catálogo completo de permisos y series de todos los tipos de documento', () => {
    const db = testDb()
    const perms = db.prepare('SELECT clave FROM permisos').all() as { clave: string }[]
    expect(perms.map((p) => p.clave).sort()).toEqual([...permissionKeys].sort())
    const tipos = db.prepare('SELECT COUNT(*) AS n FROM series_documento').get() as { n: number }
    expect(tipos.n).toBeGreaterThanOrEqual(15)
    db.close()
  })

  it('el seed es idempotente (reinicio no duplica registros)', () => {
    const db = testDb()
    seed(db)
    seed(db)
    expect((db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS n FROM roles').get() as { n: number }).n).toBe(3)
    db.close()
  })
})

describe('autenticación', () => {
  it('login con credenciales iniciales exige cambio de contraseña', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const res = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC')
    expect(res.token).toBeTruthy()
    expect(res.debeCambiarClave).toBe(true)
    expect(res.context?.permisos).toContain('seguridad.crear')
    expect(res.context?.empresaId).toBe(1)
    db.close()
  })

  it('usuario inexistente y contraseña inválida devuelven el mismo error', () => {
    const db = testDb()
    const auth = createAuthService(db)
    expect(() => auth.login({ username: 'nobody', password: 'x' }, 'PC')).toThrowError('Usuario o contraseña incorrectos')
    expect(() => auth.login({ username: FIRST_RUN_USER, password: 'mala' }, 'PC')).toThrowError('Usuario o contraseña incorrectos')
    db.close()
  })

  it('bloquea la cuenta tras 5 intentos fallidos', () => {
    const db = testDb()
    const auth = createAuthService(db)
    for (let i = 0; i < 5; i++) {
      expect(() => auth.login({ username: FIRST_RUN_USER, password: 'mala' }, 'PC')).toThrow()
    }
    expect(() => auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC')).toThrowError('bloqueado')
    db.close()
  })

  it('el token se guarda hasheado, nunca en texto plano', () => {
    const db = testDb()
    const token = createAuthService(db).login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC').token!
    expect(token.length).toBeGreaterThan(30)
    const stored = db.prepare('SELECT token_hash FROM sesiones').all() as { token_hash: string }[]
    expect(stored).toHaveLength(1)
    expect(stored[0].token_hash).not.toBe(token)
    expect(stored[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    db.close()
  })

  it('logout cierra la sesión e invalida el token', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const { token, context } = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC')
    auth.logout(context!)
    expect(() => auth.me(token!)).toThrowError('Sesión no válida')
    db.close()
  })

  it('un administrador puede cerrar la sesión de otro usuario de su empresa', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const seguridad = createSeguridadService(db)
    const primera = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-1')
    const segunda = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-2')
    const ctx = segunda.context!
    expect(() => seguridad.closeSession(ctx, ctx.sesionId)).toThrowError(/suya/)
    seguridad.closeSession(ctx, primera.context!.sesionId)
    expect(() => auth.me(primera.token!)).toThrowError('Sesión no válida')
    expect(auth.me(segunda.token!).username).toBe(FIRST_RUN_USER)
    const audit = db.prepare("SELECT operacion, entidad FROM auditoria WHERE entidad = 'sesiones' ORDER BY id DESC LIMIT 1")
      .get() as { operacion: string; entidad: string }
    expect(audit.operacion).toBe('BLOQUEAR')
    db.close()
  })

  it('el contexto expone el cambio obligatorio y se limpia al cambiar la clave', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC')
    expect(buildContext(db, login.token!).debeCambiarClave).toBe(true)
    auth.changePassword(login.context!, FIRST_RUN_PASSWORD, 'NuevaClave123!')
    expect(buildContext(db, login.token!).debeCambiarClave).toBe(false)
    db.close()
  })

  it('cambio de contraseña requiere la actual y admite PIN de 4 dígitos', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const { token, context } = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC')
    expect(() => auth.changePassword(context!, 'incorrecta', '1234')).toThrowError('actual')
    auth.changePassword(context!, FIRST_RUN_PASSWORD, '1234')
    const row = db.prepare('SELECT debe_cambiar_clave AS flag FROM usuarios WHERE username = ?').get(FIRST_RUN_USER) as { flag: number }
    expect(row.flag).toBe(0)
    expect(auth.me(token!).username).toBe(FIRST_RUN_USER)
    expect(() => auth.login({ username: FIRST_RUN_USER, password: '1234' }, 'PC')).not.toThrow()
    db.close()
  })
})

describe('permisos en backend', () => {
  it('un usuario sin permiso no puede crear usuarios aunque llame directamente al service', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const seguridad = createSeguridadService(db)
    const adminCtx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC').context!
    const rolVendedor = (db.prepare("SELECT id FROM roles WHERE nombre = 'Vendedor'").get() as { id: number }).id
    const creado = seguridad.createUser(adminCtx, {
      username: 'vendedor1', nombre: 'Vendedor Uno', email: '', departamentoId: null,
      roles: [{ rolId: rolVendedor, empresaId: 1 }], activo: true
    })
    const vendedorCtx = auth.login({ username: 'vendedor1', password: creado.contrasenaInicial }, 'PC').context!
    expect(vendedorCtx.permisos).not.toContain('seguridad.crear')
    expect(() => seguridad.createUser(vendedorCtx, {
      username: 'otro', nombre: 'Otro', email: '', departamentoId: null,
      roles: [{ rolId: rolVendedor, empresaId: 1 }], activo: true
    })).toThrowError('No tiene permiso')
    db.close()
  })

  it('cambios de permisos de rol aplican de inmediato al contexto activo', () => {
    const db = testDb()
    const auth = createAuthService(db)
    const seguridad = createSeguridadService(db)
    const adminCtx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC').context!
    const rol = (db.prepare("SELECT id FROM roles WHERE nombre = 'Vendedor'").get() as { id: number }).id
    const creado = seguridad.createUser(adminCtx, {
      username: 'vendedor2', nombre: 'Vendedor Dos', email: '', departamentoId: null,
      roles: [{ rolId: rol, empresaId: 1 }], activo: true
    })
    const sesion = auth.login({ username: 'vendedor2', password: creado.contrasenaInicial }, 'PC')
    expect(sesion.context!.permisos).toContain('ventas.crear')
    seguridad.updateRole(adminCtx, { id: rol, nombre: 'Vendedor', descripcion: '', permisos: [] })
    expect(auth.me(sesion.token!).permisos).not.toContain('ventas.crear')
    db.close()
  })
})

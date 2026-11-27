import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashToken } from '../../src/main/core/password'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { decodeIpcError } from '../../src/shared/errors'
import { testDb } from '../helpers/db'

type Listener = (event: unknown, envelope: unknown) => Promise<unknown>

const em = vi.hoisted(() => ({
  dir: '',
  handlers: new Map<string, Listener>(),
  confiable: true
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => em.dir,
    relaunch: () => undefined,
    exit: () => undefined
  },
  ipcMain: {
    handle: (channel: string, listener: Listener) => {
      em.handlers.set(channel, listener)
    }
  }
}))

import { registerIpc, type Envelope } from '../../src/main/ipc/router'

const invoke = (channel: string, envelope: Envelope = {}) =>
  em.handlers.get(channel)!({ sender: { id: 1 } }, envelope)

const errorOf = async (promise: Promise<unknown>) => {
  const decoded = decodeIpcError(await promise.catch((error) => error))
  expect(decoded).not.toBeNull()
  return decoded!
}

describe('Fase 11 — router IPC real', () => {
  const db = testDb()
  let tokenInicial = ''
  let tokenAdmin = ''
  let tokenSinPermisos = ''

  beforeAll(() => {
    em.dir = mkdtempSync(join(tmpdir(), 'erp-ipc-fase11-'))
    em.handlers.clear()
    registerIpc(db, () => em.confiable)
  })

  afterAll(() => db.close())

  it('registra todos los canales como manejadores IPC', () => {
    expect(em.handlers.size).toBeGreaterThanOrEqual(140)
    for (const canal of [
      'auth.login', 'auth.me', 'auth.changePassword', 'config.get',
      'config.catalog.save', 'dashboard.resumen', 'seguridad.users.create',
      'reportes.imprimir', 'respaldos.crear', 'respaldos.restaurar',
      'impresoras.listar', 'impresion.ejecutar'
    ]) {
      expect(em.handlers.get(canal), canal).toBeTypeOf('function')
    }
  })

  it('rechaza primero un origen no confiable, antes que cualquier token', async () => {
    em.confiable = false
    try {
      const error = await errorOf(invoke('config.get', { token: 'invalido' }))
      expect(error.code).toBe('FORBIDDEN')
    } finally {
      em.confiable = true
    }
  })

  it('exige un token válido y nunca guarda el token en claro', async () => {
    const sinToken = await errorOf(invoke('config.get'))
    expect(sinToken.code).toBe('UNAUTHORIZED')
    const falso = await errorOf(invoke('config.get', { token: 'token-inventado' }))
    expect(falso.code).toBe('UNAUTHORIZED')

    const login = await invoke('auth.login', {
      input: { username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }
    }) as { token?: string; debeCambiarClave?: boolean; context?: Record<string, unknown> }
    expect(login.debeCambiarClave).toBe(true)
    expect(login.token).toBeTruthy()
    // El token se entrega una sola vez al preload; el contexto del renderer no lo incluye.
    expect(login.context).toBeDefined()
    expect((login.context as Record<string, unknown>).token).toBeUndefined()
    expect((login.context as Record<string, unknown>).iniciaEn).toBeTruthy()
    expect(JSON.stringify(login.context)).not.toContain(login.token!)
    tokenInicial = login.token!
    const fila = db.prepare('SELECT token_hash, equipo FROM sesiones WHERE token_hash = ?')
      .get(hashToken(tokenInicial)) as { token_hash: string; equipo: string } | undefined
    expect(fila?.token_hash).toBe(hashToken(tokenInicial))
    expect(fila?.token_hash).not.toContain(tokenInicial)
    expect(fila?.equipo).toBe('ESTACION_LOCAL')
  })

  it('aplica la política de cambio de clave con su allowlist', async () => {
    const bloqueado = await errorOf(invoke('config.get', { token: tokenInicial }))
    expect(bloqueado.code).toBe('PASSWORD_CHANGE_REQUIRED')

    const yo = await invoke('auth.me', { token: tokenInicial }) as { username: string; token?: string }
    expect(yo.username).toBe(FIRST_RUN_USER)
    expect(yo.token).toBeUndefined()

    const debil = await errorOf(invoke('auth.changePassword', {
      token: tokenInicial,
      input: { currentPassword: FIRST_RUN_PASSWORD, newPassword: 'abc' }
    }))
    expect(debil.code).toBe('VALIDATION')

    await invoke('auth.changePassword', {
      token: tokenInicial,
      // El router acepta un PIN de 4 dígitos tras la relajación de la política.
      input: { currentPassword: FIRST_RUN_PASSWORD, newPassword: '1234' }
    })
    tokenAdmin = tokenInicial
    const config = await invoke('config.get', {
      token: tokenAdmin
    }) as { empresa: { moneda_base: string }; parametros: Record<string, string> }
    expect(config.empresa.moneda_base).toBe('DOP')
    expect(config.parametros.backup_frecuencia).toBeTruthy()
  })

  it('verifica el permiso de ruta con un usuario real sin permisos', async () => {
    const rol = await invoke('seguridad.roles.create', {
      token: tokenAdmin,
      input: { nombre: 'Sin permisos F11', descripcion: 'Prueba integral', permisos: [] }
    }) as { id: number }
    const creado = await invoke('seguridad.users.create', {
      token: tokenAdmin,
      input: {
        username: 'fase11user', nombre: 'Usuario Fase 11',
        roles: [{ rolId: rol.id, empresaId: 1 }], activo: true
      }
    }) as { id: number; contrasenaInicial: string }

    const login = await invoke('auth.login', {
      input: { username: 'fase11user', password: creado.contrasenaInicial }
    }) as { token: string }
    tokenSinPermisos = login.token
    const sinPermisos = await errorOf(invoke('dashboard.resumen', { token: tokenSinPermisos }))
    expect(sinPermisos.code).toBe('FORBIDDEN')
    const identidad = await invoke('auth.me', { token: tokenSinPermisos }) as { permisos: string[] }
    expect(identidad.permisos).toEqual([])

    await invoke('auth.changePassword', {
      token: tokenSinPermisos,
      input: { currentPassword: creado.contrasenaInicial, newPassword: 'UsuarioF11!' }
    })
  })

  it('valida los esquemas Zod y la whitelist de catálogos', async () => {
    const parametro = await errorOf(invoke('config.parametro.set', {
      token: tokenAdmin, input: { clave: 7, valor: 'x' }
    }))
    expect(parametro.code).toBe('VALIDATION')
    expect(parametro.message).toMatch(/clave/i)

    const catalogo = await errorOf(invoke('config.catalog.save', {
      token: tokenAdmin, input: { tabla: 'usuarios', data: {} }
    }))
    expect(catalogo.code).toBe('VALIDATION')
  })

  it('expone impresoras del sistema y valida las opciones de impresión', async () => {
    expect(await invoke('impresoras.listar', { token: tokenAdmin })).toEqual([])
    const invalida = await errorOf(invoke('impresion.ejecutar', {
      token: tokenAdmin, input: { opciones: { copias: 0 } }
    }))
    expect(invalida.code).toBe('VALIDATION')
  })

  it('cambia de empresa sin pedir contraseña y emite un token nuevo', async () => {
    const nueva = await invoke('config.empresa.save', {
      token: tokenAdmin,
      input: {
        nombreComercial: 'Empresa IPC', razonSocial: 'EMPRESA IPC, SRL', rnc: '',
        cedula: '', direccion: '', telefonos: '', email: '', monedaBase: 'DOP', activa: true
      }
    }) as { id: number }
    const yo = await invoke('auth.me', { token: tokenAdmin }) as { userId: number }
    const rol = db.prepare('SELECT id FROM roles WHERE empresa_id = ? AND nombre = ?')
      .get(nueva.id, 'Administrador') as { id: number }
    // La asignación de roles solo permite la empresa activa; en la prueba se
    // siembra directamente para simular un usuario que ya tenía acceso a ambas.
    db.prepare('INSERT OR IGNORE INTO usuario_roles (usuario_id, rol_id, empresa_id) VALUES (?, ?, ?)')
      .run(yo.userId, rol.id, nueva.id)

    const me = await invoke('auth.me', { token: tokenAdmin }) as { empresas?: { id: number }[] }
    expect(me.empresas?.map((e) => e.id)).toContain(nueva.id)

    const cambio = await invoke('auth.switchCompany', { token: tokenAdmin, input: nueva.id }) as {
      token?: string; context?: Record<string, unknown>
    }
    expect(cambio.token).toBeTruthy()
    expect(cambio.token).not.toBe(tokenAdmin)
    expect(cambio.context?.empresaId).toBe(nueva.id)
    expect(cambio.context?.token).toBeUndefined()
    const activa = await invoke('auth.me', { token: cambio.token }) as { empresaId: number }
    expect(activa.empresaId).toBe(nueva.id)
    const anterior = await errorOf(invoke('auth.me', { token: tokenAdmin }))
    expect(anterior.code).toBe('UNAUTHORIZED')
  })

  it('cierra la sesión cuando su actividad quedó expirada', async () => {
    db.prepare("UPDATE sesiones SET ultima_actividad = '2000-01-01 00:00:00' WHERE token_hash = ?")
      .run(hashToken(tokenSinPermisos))
    const expirada = await errorOf(invoke('auth.me', { token: tokenSinPermisos }))
    expect(expirada.code).toBe('UNAUTHORIZED')
  })
})

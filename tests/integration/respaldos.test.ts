import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../../src/main/db/connection'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createConfiguracionService } from '../../src/main/services/configuracion.service'
import {
  consumirRestauracionPendiente, createBackupsService, desempaquetarBackups,
  registrarRestauracionAuditoria, verificarArtefactoBackups,
  type MarcadorRestauracion
} from '../../src/main/services/backups.service'
import { defaultSettings, type Settings } from '@shared/settings'
import type { SessionContext } from '@shared/session'

const temporales: string[] = []

function setup(preferencias: Partial<Settings['respaldos']> = {}) {
  const userDataPath = mkdtempSync(join(tmpdir(), 'erp-fase10-'))
  temporales.push(userDataPath)
  const settings: Settings = {
    ...defaultSettings,
    respaldos: { ...defaultSettings.respaldos, ...preferencias }
  }
  writeFileSync(join(userDataPath, 'settings.json'), JSON.stringify(settings))
  const dbPath = join(userDataPath, 'data', 'enterprise.db')
  const db = createDatabase(dbPath)
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-FASE10').context as SessionContext
  let reinicios = 0
  const servicio = createBackupsService({
    db, userDataPath, dbPath, reiniciar: () => { reinicios += 1 },
    leerSettings: () => settings
  })
  return { db, dbPath, userDataPath, ctx, servicio, settings, reinicios: () => reinicios }
}

afterEach(() => {
  while (temporales.length) {
    rmSync(temporales.pop()!, { recursive: true, force: true })
  }
})

describe('Fase 10 — respaldos reales con SQLite', () => {
  it('crea una copia manual verificada, la registra y la audita', async () => {
    const { db, ctx, servicio } = setup()
    const copia = await servicio.crear(ctx, { tipo: 'MANUAL' })

    expect(existsSync(copia.ruta)).toBe(true)
    expect(statSync(copia.ruta).size).toBeGreaterThan(0)
    expect(copia.integridadOk).toBe(true)
    const historial = servicio.historial(ctx)
    expect(historial).toHaveLength(1)
    expect(historial[0]).toMatchObject({ id: copia.id, tipo: 'MANUAL', integridadOk: true })
    const audit = db.prepare(`
      SELECT operacion, entidad FROM auditoria WHERE operacion = 'RESPALDO_CREADO'
    `).get() as { operacion: string; entidad: string } | undefined
    expect(audit).toMatchObject({ operacion: 'RESPALDO_CREADO', entidad: 'respaldos' })
    db.close()
  })

  it('verifica integridad real de la base actual y de una copia', async () => {
    const { db, ctx, servicio } = setup()
    const copia = await servicio.crear(ctx, { tipo: 'MANUAL' })

    expect(servicio.integridad(ctx, {})).toMatchObject({ ok: true, destino: 'base de datos actual' })
    expect(servicio.integridad(ctx, { id: copia.id })).toMatchObject({ ok: true, destino: `copia ${copia.id}` })
    expect(() => servicio.integridad({ ...ctx, permisos: [] }, {})).toThrowError(/permiso/i)
    db.close()
  })

  it('rechaza crear y restaurar sin permisos o sin confirmación', async () => {
    const { db, ctx, servicio } = setup()
    const sinCrear = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'configuracion.respaldo.crear') }
    await expect(servicio.crear(sinCrear, { tipo: 'MANUAL' })).rejects.toThrowError(/permiso/i)
    await expect(servicio.restaurar({ ...ctx, permisos: [] }, {
      id: 1, confirmacion: 'RESTAURAR'
    })).rejects.toThrowError(/permiso/i)
    await expect(servicio.restaurar(ctx, {
      id: 1, confirmacion: 'OTRO' as 'RESTAURAR'
    })).rejects.toThrowError(/confirmación/i)
    db.close()
  })

  it('impide restaurar mientras hay más de una instancia abierta', async () => {
    const { db, dbPath, userDataPath, ctx, servicio, settings } = setup()
    const copia = await servicio.crear(ctx, { tipo: 'MANUAL' })
    const conOtraInstancia = createBackupsService({
      db, userDataPath, dbPath, instanciasActivas: () => 2, leerSettings: () => settings
    })

    await expect(conOtraInstancia.restaurar(ctx, {
      id: copia.id, confirmacion: 'RESTAURAR'
    })).rejects.toThrowError(/cierre las demás instancias/i)
    db.close()
  })

  it('protege los parámetros backup_ del canal genérico de configuración', () => {
    const { db, ctx } = setup()
    const config = createConfiguracionService(db)
    const sinRespaldo = {
      ...ctx,
      permisos: ctx.permisos.filter((p) => p !== 'configuracion.respaldo.crear')
    }
    expect(() => config.setParametro(sinRespaldo, 'backup_frecuencia', 'DESACTIVADO'))
      .toThrowError(/permiso/i)
    expect(() => config.setParametro(ctx, 'backup_frecuencia', 'DESACTIVADO')).not.toThrow()
    expect(config.getConfig(ctx).parametros.backup_frecuencia).toBe('DESACTIVADO')
    db.close()
  })

  it('restaura en etapas: copia previa, marcador y reemplazo antes de abrir SQLite', async () => {
    const { db, dbPath, userDataPath, ctx, servicio, reinicios } = setup()
    const copia = await servicio.crear(ctx, { tipo: 'MANUAL' })

    db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre, tipo, rnc_cedula)
      VALUES (1, 'POST-BACKUP', 'Cambio posterior', 'EMPRESA', '999000111')
    `).run()
    expect(db.prepare("SELECT COUNT(*) AS n FROM clientes WHERE codigo = 'POST-BACKUP'").get()).toMatchObject({ n: 1 })

    const resultado = await servicio.restaurar(ctx, { id: copia.id, confirmacion: 'RESTAURAR' })
    expect(resultado).toMatchObject({ ok: true, reiniciando: true })
    expect(Number(resultado.copiaPreviaId)).toBeGreaterThan(copia.id)

    const marcadorPath = join(userDataPath, 'restore-pending.json')
    expect(existsSync(marcadorPath)).toBe(true)
    const marcador = JSON.parse(readFileSync(marcadorPath, 'utf8')) as MarcadorRestauracion
    expect(marcador.backupId).toBe(copia.id)
    expect(marcador.ruta).toBe(copia.ruta)
    expect(servicio.historial(ctx).some((f) => f.tipo === 'PRE_RESTAURACION')).toBe(true)
    expect(reinicios()).toBe(0)

    db.close()
    expect(consumirRestauracionPendiente(userDataPath, dbPath)).toMatchObject({ backupId: copia.id })
    expect(existsSync(marcadorPath)).toBe(false)

    const restaurada = createDatabase(dbPath, false)
    expect(restaurada.prepare("SELECT COUNT(*) AS n FROM clientes WHERE codigo = 'POST-BACKUP'").get()).toMatchObject({ n: 0 })
    registrarRestauracionAuditoria(restaurada, marcador)
    expect(restaurada.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE operacion = 'RESTAURACION_APLICADA'").get()).toMatchObject({ n: 1 })
    restaurada.close()
  })
})

describe('settings.respaldos aplicados en el artefacto', () => {
  it('comprime según la preferencia y usa una extensión coherente', async () => {
    const comprimido = setup({ compresion: true, incluirPreferencias: false })
    const copia = await comprimido.servicio.crear(comprimido.ctx, { tipo: 'MANUAL' })
    expect(copia.ruta).toMatch(/\.tar\.gz$/)
    const entradas = desempaquetarBackups(readFileSync(copia.ruta), true)
    expect(entradas.map((e) => e.nombre)).toEqual(['enterprise.db'])
    expect(verificarArtefactoBackups(copia.ruta).ok).toBe(true)
    comprimido.db.close()

    const plano = setup({ compresion: false, incluirPreferencias: false })
    const copiaPlana = await plano.servicio.crear(plano.ctx, { tipo: 'MANUAL' })
    expect(copiaPlana.ruta).toMatch(/\.tar$/)
    expect(copiaPlana.ruta).not.toMatch(/\.tar\.gz$/)
    expect(desempaquetarBackups(readFileSync(copiaPlana.ruta), false).map((e) => e.nombre))
      .toEqual(['enterprise.db'])
    plano.db.close()
  })

  it('incluye settings.json en el artefacto cuando la estación lo pide', async () => {
    const { db, userDataPath, ctx, servicio } = setup({
      compresion: false, incluirPreferencias: true
    })
    writeFileSync(join(userDataPath, 'settings.json'), JSON.stringify({
      ...defaultSettings, sidebarCollapsed: true
    }))
    const copia = await servicio.crear(ctx, { tipo: 'MANUAL' })
    const entradas = desempaquetarBackups(readFileSync(copia.ruta), false)
    expect(entradas.map((e) => e.nombre)).toEqual(['enterprise.db', 'settings.json'])
    const preferencias = JSON.parse(entradas[1].contenido.toString('utf8')) as Settings
    expect(preferencias.sidebarCollapsed).toBe(true)
    db.close()
  })

  it('verificarAlCrear decide si se valida el artefacto y se registra su hash', async () => {
    const verificado = setup({ verificarAlCrear: true })
    const copia = await verificado.servicio.crear(verificado.ctx, { tipo: 'MANUAL' })
    expect(copia.integridadOk).toBe(true)
    const audit = verificado.db.prepare(`
      SELECT valores_despues FROM auditoria WHERE operacion = 'RESPALDO_CREADO' ORDER BY id DESC LIMIT 1
    `).get() as { valores_despues: string }
    expect(JSON.parse(audit.valores_despues)).toMatchObject({
      integridadOk: true, verificado: true, hash: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    verificado.db.close()

    const sinVerificar = setup({ verificarAlCrear: false })
    const copiaSinVerificar = await sinVerificar.servicio.crear(sinVerificar.ctx, { tipo: 'MANUAL' })
    expect(copiaSinVerificar.integridadOk).toBe(false)
    sinVerificar.db.close()
  })

  it('rechaza un artefacto vacío antes de marcarlo como válido', () => {
    const { userDataPath, db } = setup()
    const vacio = join(userDataPath, 'enterprise_vacio.tar')
    writeFileSync(vacio, '')
    expect(() => verificarArtefactoBackups(vacio)).toThrowError(/vacía/)
    db.close()
  })
})

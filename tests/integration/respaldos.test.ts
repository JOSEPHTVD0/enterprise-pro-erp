import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../../src/main/db/connection'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createConfiguracionService } from '../../src/main/services/configuracion.service'
import {
  consumirRestauracionPendiente, createBackupsService, registrarRestauracionAuditoria,
  type MarcadorRestauracion
} from '../../src/main/services/backups.service'
import type { SessionContext } from '@shared/session'

const temporales: string[] = []

function setup() {
  const userDataPath = mkdtempSync(join(tmpdir(), 'erp-fase10-'))
  temporales.push(userDataPath)
  const dbPath = join(userDataPath, 'data', 'enterprise.db')
  const db = createDatabase(dbPath)
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-FASE10').context as SessionContext
  let reinicios = 0
  const servicio = createBackupsService({
    db, userDataPath, dbPath, reiniciar: () => { reinicios += 1 }
  })
  return { db, dbPath, userDataPath, ctx, servicio, reinicios: () => reinicios }
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

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { closeDatabase, createDatabase, initializeDatabase } from '../../src/main/db/connection'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { loadSettings, saveSettings } from '../../src/main/settings'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>

const em = vi.hoisted(() => ({ dir: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => em.dir }
}))

describe('Fase 11 — persistencia en frío y arranque controlado', () => {
  it('conserva maestros, documentos, auditoría y preferencias tras cerrar y reabrir', () => {
    em.dir = mkdtempSync(join(tmpdir(), 'erp-persistencia-f11-'))
    const archivo = join(em.dir, 'data', 'enterprise.db')

    const db = createDatabase(archivo)
    const ctx = createAuthService(db)
      .login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'F11-FRIO').context as SessionContext
    const maestros = createMaestrosService(db)
    const { id: clienteId } = maestros.save(ctx, 'clientes', {
      codigo: 'CLI-FRIO', nombre: 'Cliente Persistente', tipo: 'EMPRESA', activo: true
    }) as { id: number }
    const sesion = db.prepare('SELECT token_hash FROM sesiones WHERE fin IS NULL LIMIT 1').get() as Fila
    saveSettings({ theme: 'dark', sidebarCollapsed: true })
    db.close()

    const reabierta = createDatabase(archivo, false)
    const cliente = reabierta.prepare('SELECT id, codigo, nombre FROM clientes WHERE id = ?').get(clienteId) as Fila
    expect(cliente.codigo).toBe('CLI-FRIO')
    expect((reabierta.prepare('SELECT COUNT(*) AS total FROM auditoria WHERE entidad = ? AND entidad_id = ?')
      .get('clientes', String(clienteId)) as Fila).total).toBeGreaterThan(0)
    // La reapertura conserva el registro: las políticas de sesión se aplican en buildContext.
    expect(reabierta.prepare('SELECT id FROM sesiones WHERE token_hash = ?').get(sesion.token_hash)).toEqual({ id: 1 })
    expect(loadSettings().theme).toBe('dark')
    reabierta.close()
  })

  it('initializeDatabase conserva las sesiones para permitir varias instancias', () => {
    em.dir = mkdtempSync(join(tmpdir(), 'erp-arranque-f11-'))
    const primera = createDatabase(join(em.dir, 'data', 'enterprise.db'))
    createAuthService(primera).login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'F11-ARRANQUE')
    expect(primera.prepare('SELECT COUNT(*) AS total FROM sesiones WHERE fin IS NULL').get()).toEqual({ total: 1 })
    primera.close()

    const segunda = initializeDatabase()
    const sesiones = segunda.prepare('SELECT id, fin FROM sesiones').all() as Fila[]
    expect(sesiones.length).toBe(1)
    // No se cierra al abrir otra instancia: buildContext aplica 30 min / 12 h en cada llamada.
    expect(sesiones[0].fin).toBeNull()
    closeDatabase()
  })
})

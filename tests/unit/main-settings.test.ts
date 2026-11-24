import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings } from '@shared/settings'

const dir = mkdtempSync(join(tmpdir(), 'erp-settings-'))

vi.mock('electron', () => ({
  app: { getPath: () => dir }
}))

import { loadSettings, saveSettings } from '../../src/main/settings'

describe('persistencia de preferencias (proceso principal)', () => {
  beforeEach(() => {
    const file = join(dir, 'settings.json')
    if (existsSync(file)) rmSync(file)
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('sin archivo devuelve los valores por defecto', () => {
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('guarda y recupera los valores (sobrevive a reinicio)', () => {
    const esperado = { ...defaultSettings, theme: 'dark' as const, sidebarCollapsed: true }
    saveSettings(esperado)
    expect(loadSettings()).toEqual(esperado)
    // Segunda lectura simulando un nuevo arranque de la aplicación.
    expect(loadSettings()).toEqual(esperado)
  })

  it('escribe JSON válido en disco', () => {
    const esperado = {
      ...defaultSettings,
      theme: 'light' as const,
      sidebarCollapsed: false,
      impresion: { ...defaultSettings.impresion, formato: 'TICKET80' as const }
    }
    saveSettings(esperado)
    const raw = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf-8'))
    expect(raw).toEqual(esperado)
  })

  it('rechaza payloads inválidos sin escribir nada', () => {
    expect(() => saveSettings({ theme: 'neon', sidebarCollapsed: false })).toThrow()
    expect(existsSync(join(dir, 'settings.json'))).toBe(false)
  })

  it('archivo corrupto → valores por defecto (recuperación ante fallos)', () => {
    writeFileSync(join(dir, 'settings.json'), '{corrupto!!', 'utf-8')
    expect(loadSettings()).toEqual(defaultSettings)
  })

  it('archivo con esquema inválido → valores por defecto', () => {
    writeFileSync(join(dir, 'settings.json'), '{"theme":42}', 'utf-8')
    expect(loadSettings()).toEqual(defaultSettings)
  })
})

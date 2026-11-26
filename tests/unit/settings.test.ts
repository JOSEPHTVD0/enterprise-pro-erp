import { describe, it, expect } from 'vitest'
import { defaultSettings, resolveTheme, settingsSchema } from '@shared/settings'

describe('settingsSchema', () => {
  it('acepta los valores por defecto', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings)
  })

  it('acepta combinaciones válidas y aplica defaults avanzados', () => {
    const parsed = settingsSchema.parse({ theme: 'dark', sidebarCollapsed: true })
    expect(parsed.theme).toBe('dark')
    expect(parsed.sidebarCollapsed).toBe(true)
    expect(parsed.interfaz.densidad).toBe('normal')
    expect(parsed.fiscal.moneda).toBe('DOP')
    expect(parsed.panel.filasDashboard).toBe(8)
  })

  it('valida los grupos avanzados', () => {
    const parsed = settingsSchema.parse({
      ...defaultSettings,
      impresion: { ...defaultSettings.impresion, formato: 'TICKET_80', copias: 2 },
      seguridad: { ...defaultSettings.seguridad, enmascararRnc: true }
    })
    expect(parsed.impresion.formato).toBe('TICKET_80')
    expect(parsed.impresion.copias).toBe(2)
    expect(parsed.seguridad.enmascararRnc).toBe(true)
  })

  it('migra los formatos históricos de tickets al vocabulario actual', () => {
    const parsed = settingsSchema.parse({
      ...defaultSettings,
      impresion: { ...defaultSettings.impresion, formato: 'TICKET58' }
    })
    expect(parsed.impresion.formato).toBe('TICKET_58')
  })

  it('rechaza temas desconocidos', () => {
    expect(settingsSchema.safeParse({ theme: 'neon', sidebarCollapsed: false }).success).toBe(false)
  })

  it('rechaza tipos incorrectos', () => {
    expect(settingsSchema.safeParse({ theme: 'light', sidebarCollapsed: 'yes' }).success).toBe(false)
    expect(settingsSchema.safeParse(null).success).toBe(false)
    expect(settingsSchema.safeParse({
      ...defaultSettings,
      interfaz: { ...defaultSettings.interfaz, tamanoFuente: 'grande' }
    }).success).toBe(false)
  })

  it('ignora claves extra (no permite inyección de campos)', () => {
    const parsed = settingsSchema.parse({ ...defaultSettings, hack: true })
    expect('hack' in parsed).toBe(false)
  })
})

describe('resolveTheme', () => {
  it('light y dark son explícitos', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system sigue la preferencia del sistema', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

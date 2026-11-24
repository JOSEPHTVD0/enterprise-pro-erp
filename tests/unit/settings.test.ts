import { describe, it, expect } from 'vitest'
import { defaultSettings, resolveTheme, settingsSchema } from '@shared/settings'

describe('settingsSchema', () => {
  it('acepta los valores por defecto', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings)
  })

  it('acepta combinaciones válidas', () => {
    const s = { theme: 'dark', sidebarCollapsed: true }
    expect(settingsSchema.parse(s)).toEqual(s)
  })

  it('rechaza temas desconocidos', () => {
    expect(settingsSchema.safeParse({ theme: 'neon', sidebarCollapsed: false }).success).toBe(false)
  })

  it('rechaza tipos incorrectos', () => {
    expect(settingsSchema.safeParse({ theme: 'light', sidebarCollapsed: 'yes' }).success).toBe(false)
    expect(settingsSchema.safeParse(null).success).toBe(false)
    expect(settingsSchema.safeParse({}).success).toBe(false)
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

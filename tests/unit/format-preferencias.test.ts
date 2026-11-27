import { beforeEach, describe, expect, it } from 'vitest'
import { defaultSettings } from '@shared/settings'
import { useAppStore } from '@/app/store'
import { formatFecha, money } from '@/lib/format'

describe('formato según preferencias de la estación', () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        fiscal: { ...defaultSettings.fiscal }
      }
    })
  })

  it('money respeta moneda y decimales configurados', () => {
    const esperadoDop = new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: 'DOP',
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(1234.56)
    expect(money(123456)).toBe(esperadoDop)

    useAppStore.setState((s) => ({
      settings: {
        ...s.settings,
        fiscal: { ...s.settings.fiscal, moneda: 'USD', decimalesDinero: 0 }
      }
    }))
    const esperadoUsd = new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(1234.56)
    expect(money(123456)).toBe(esperadoUsd)
  })

  it('formatFecha respeta el formato configurado y fechas ISO', () => {
    expect(formatFecha('2026-01-05', 'yyyy-MM-dd')).toBe('2026-01-05')
    expect(formatFecha('2026-01-05', 'dd/MM/yyyy')).toBe('05/01/2026')
    expect(formatFecha('2026-01-05', 'MM/dd/yyyy')).toBe('01/05/2026')
    expect(formatFecha('no-fecha')).toBe('—')
  })

  it('usa el formato persistido cuando no se pasa argumento', () => {
    useAppStore.setState((s) => ({
      settings: {
        ...s.settings,
        fiscal: { ...s.settings.fiscal, formatoFecha: 'yyyy-MM-dd' }
      }
    }))
    expect(formatFecha('2026-01-05')).toBe('2026-01-05')
  })
})

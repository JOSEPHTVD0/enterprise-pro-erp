import { describe, expect, it } from 'vitest'
import { clavePeriodo, debeEjecutar } from '../../src/main/services/backups.service'

const fecha = (anio: number, mes: number, dia: number, hora = 2, minuto = 0): string => {
  const d = new Date(anio, mes - 1, dia, hora, minuto, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

describe('programador de respaldos (lógica pura)', () => {
  it('no ejecuta cuando está desactivado', () => {
    expect(debeEjecutar('DESACTIVADO', '02:00', null, new Date(2026, 0, 2, 3))).toBe(false)
  })

  it('respeta la hora local configurada', () => {
    const ahora = new Date(2026, 0, 2, 1, 59)
    expect(debeEjecutar('DIARIO', '02:00', null, ahora)).toBe(false)
    expect(debeEjecutar('DIARIO', '02:00', null, new Date(2026, 0, 2, 2, 1))).toBe(true)
  })

  it('evita dos copias diarias del mismo día', () => {
    const ahora = new Date(2026, 0, 2, 18)
    expect(debeEjecutar('DIARIO', '02:00', fecha(2026, 1, 2), ahora)).toBe(false)
    expect(debeEjecutar('DIARIO', '02:00', fecha(2026, 1, 1), ahora)).toBe(true)
  })

  it('respeta períodos semanales y mensuales', () => {
    const ahora = new Date(2026, 0, 7, 10)
    expect(clavePeriodo(new Date(2026, 0, 5), 'SEMANAL')).toBe('2026-01-05')
    expect(clavePeriodo(new Date(2026, 0, 7), 'SEMANAL')).toBe('2026-01-05')
    expect(debeEjecutar('SEMANAL', '02:00', fecha(2026, 1, 5), ahora)).toBe(false)
    expect(debeEjecutar('SEMANAL', '02:00', fecha(2025, 12, 29), ahora)).toBe(true)
    expect(debeEjecutar('MENSUAL', '02:00', fecha(2026, 1, 1), ahora)).toBe(false)
    expect(debeEjecutar('MENSUAL', '02:00', fecha(2025, 12, 1), ahora)).toBe(true)
  })
})

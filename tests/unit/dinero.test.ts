import { describe, it, expect } from 'vitest'
import {
  centavosDesdeDecimal, decimalDesdeCentavos, dividirCentavos,
  multiplicarCentavos, redondear, redondearCantidad
} from '../../src/shared/dinero'

describe('core/dinero — centavos enteros', () => {
  it('convierte decimales a centavos sin error binario', () => {
    expect(centavosDesdeDecimal(1.005)).toBe(101)
    expect(centavosDesdeDecimal(0.1 + 0.2)).toBe(30)
    expect(centavosDesdeDecimal(125.5)).toBe(12550)
    expect(decimalDesdeCentavos(12550)).toBe(125.5)
  })

  it('redondea cantidades a cuatro decimales', () => {
    expect(redondearCantidad(1.23456)).toBe(1.2346)
    expect(redondearCantidad(-1.23456)).toBe(-1.2346)
    expect(redondearCantidad(2)).toBe(2)
  })

  it('multiplica y divide usando el redondeo central', () => {
    expect(multiplicarCentavos(150, 2.5)).toBe(375)
    expect(multiplicarCentavos(101, 1.005)).toBe(102)
    expect(dividirCentavos(100, 3)).toBe(33)
    expect(redondear(1.000000001)).toBe(1)
    expect(() => dividirCentavos(100, 0)).toThrow()
    expect(() => centavosDesdeDecimal(Number.NaN)).toThrow()
  })
})

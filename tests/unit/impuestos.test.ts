import { describe, expect, it } from 'vitest'
import {
  calcularCambio, calcularDescuento, calcularImpuesto, calcularLinea, resumenLineas
} from '../../src/main/core/impuestos'

describe('cálculo de impuestos y descuentos en centavos', () => {
  it('calcula descuentos porcentuales con puntos base', () => {
    expect(calcularDescuento(20000, 1000)).toBe(2000)
    expect(calcularDescuento(19999, 500)).toBe(1000)
    expect(calcularDescuento(20000, 0)).toBe(0)
  })

  it('respeta un descuento fijo y rechaza importes inválidos', () => {
    expect(calcularDescuento(20000, 5000, 1500)).toBe(1500)
    expect(() => calcularDescuento(20000, 0, 20001)).toThrow(/subtotal/)
    expect(() => calcularDescuento(20000, 10001)).toThrow(/puntos base/)
  })

  it('calcula ITBIS sobre la base descontada y respeta exención', () => {
    expect(calcularImpuesto(36000, 1800)).toBe(6480)
    expect(calcularImpuesto(36000, 1800, true)).toBe(0)
    expect(() => calcularImpuesto(1000, -1)).toThrow(/puntos base/)
  })

  it('cuadra una línea completa', () => {
    const linea = calcularLinea({
      cantidad: 2, precioCent: 20000, descuentoPctBp: 1000, tasaBp: 1800
    })
    expect(linea).toMatchObject({
      subtotalCent: 40000,
      descuentoCent: 4000,
      descuento1Cent: 4000,
      descuento2Cent: 0,
      descuento3Cent: 0,
      baseCent: 36000,
      impuestoCent: 6480,
      totalCent: 42480
    })
  })

  it('suma líneas sin deriva de redondeo', () => {
    const a = calcularLinea({ cantidad: 1, precioCent: 101, tasaBp: 1800 })
    const b = calcularLinea({ cantidad: 3, precioCent: 333, tasaBp: 0 })
    const resumen = resumenLineas([a, b])
    expect(resumen.totalCent).toBe(resumen.subtotalCent - resumen.descuentoCent + resumen.impuestoCent)
  })

  it('rechaza cantidades y precios inválidos', () => {
    expect(() => calcularLinea({ cantidad: 0, precioCent: 100, tasaBp: 0 })).toThrow(/cantidad/)
    expect(() => calcularLinea({ cantidad: 1, precioCent: 10.5, tasaBp: 0 })).toThrow(/centavos/)
  })

  it('calcula el cambio sin devolver montos negativos', () => {
    expect(calcularCambio(42480, 50000)).toBe(7520)
    expect(calcularCambio(42480, 42480)).toBe(0)
    expect(calcularCambio(42480, 40000)).toBe(0)
  })
})

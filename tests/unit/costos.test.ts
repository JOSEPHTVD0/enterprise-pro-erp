import { describe, it, expect } from 'vitest'
import {
  calcularEntrada, calcularEntradaSinRecalculo, calcularSalida, costoVigente
} from '../../src/main/core/costos'

describe('core/costos — promedio ponderado', () => {
  it('recalcula el promedio solo con entradas', () => {
    const r = calcularEntrada({
      existenciaCantidad: 10, existenciaValorCent: 1000,
      entradaCantidad: 10, entradaCostoUnitCent: 200
    })
    expect(r).toEqual({ cantidad: 20, valorCent: 3000, costoUnitCent: 150 })
  })

  it('respeta cantidades fraccionarias y redondea a centavos', () => {
    const r = calcularEntrada({
      existenciaCantidad: 1.5, existenciaValorCent: 1500,
      entradaCantidad: 0.25, entradaCostoUnitCent: 1000
    })
    expect(r.cantidad).toBe(1.75)
    expect(r.valorCent).toBe(1750)
    expect(r.costoUnitCent).toBe(1000)
  })

  it('conserva el valor en una transferencia sin recálculo', () => {
    const r = calcularEntradaSinRecalculo(4, 1000, 2, 250)
    expect(r.cantidad).toBe(6)
    expect(r.valorCent).toBe(1500)
    expect(r.costoUnitCent).toBe(250)
  })

  it('las salidas no modifican el promedio', () => {
    const r = calcularSalida(150, 3, 20, 3000)
    expect(r.costoTotalCent).toBe(450)
    expect(r.saldoCantidad).toBe(17)
    expect(r.saldoValorCent).toBe(2550)
    expect(r.costoUnitCent).toBe(150)
  })

  it('permite stock negativo sin valor negativo', () => {
    const r = calcularSalida(100, 5, 2, 200)
    expect(r.saldoCantidad).toBe(-3)
    expect(r.saldoValorCent).toBe(0)
    expect(r.costoTotalCent).toBe(500)
  })

  it('deriva el costo vigente del saldo valorado', () => {
    expect(costoVigente(150, 20, 3000)).toBe(150)
    expect(costoVigente(150, 3, 1000)).toBe(333)
    expect(costoVigente(150, 0, 0)).toBe(150)
  })

  it('rechaza entradas sin cantidad y costos negativos', () => {
    expect(() => calcularEntrada({
      existenciaCantidad: 0, existenciaValorCent: 0,
      entradaCantidad: 0, entradaCostoUnitCent: 100
    })).toThrow(/mayor que cero/)
    expect(() => calcularEntrada({
      existenciaCantidad: 0, existenciaValorCent: 0,
      entradaCantidad: 1, entradaCostoUnitCent: -1
    })).toThrow(/negativo/)
  })
})

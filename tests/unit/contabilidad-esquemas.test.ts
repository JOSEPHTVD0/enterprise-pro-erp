import { describe, expect, it } from 'vitest'
import { naturalezas, padresPlanCuentasBase, planCuentasBase, tiposCuenta } from '../../src/shared/contabilidad'
import {
  asientoCrearSchema, asientoEstadoSchema, cuentaCrearSchema, cuentaModificarSchema,
  cuentaEstadoSchema, fechaContSchema, filtroContabilidadSchema, idContSchema,
  integrarSchema, mayorSchema, periodoAbrirSchema, periodoCerrarSchema
} from '../../src/shared/schemas/contabilidad'

describe('contabilidad — esquemas compartidos', () => {
  it('valida identificadores, fechas y enumerate tipos y naturalezas', () => {
    expect(idContSchema.parse(1)).toBe(1)
    expect(() => idContSchema.parse(0)).toThrow()
    expect(fechaContSchema.parse('2026-11-24')).toBe('2026-11-24')
    expect(() => fechaContSchema.parse('24/11/2026')).toThrow()
    expect(tiposCuenta).toEqual(['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO'])
    expect(naturalezas).toEqual(['DEUDORA', 'ACREEDORA'])
  })

  it('aplica defaults de filtros con conDefaultsDeObjetoVacio', () => {
    const base = filtroContabilidadSchema.parse(undefined)
    expect(base.limite).toBe(300)
    expect(base.estado).toBeUndefined()
    expect(filtroContabilidadSchema.parse({ estado: 'CONFIRMADO' }).limite).toBe(300)
    expect(integrarSchema.parse(undefined).limite).toBe(200)
    expect(() => filtroContabilidadSchema.parse({ limite: 0 })).toThrow()
  })

  it('valida altas y modificaciones de cuentas', () => {
    const cuenta = cuentaCrearSchema.parse({
      codigo: '5300', nombre: 'Papelería', tipo: 'GASTO', naturaleza: 'DEUDORA', padreId: 1
    })
    expect(cuenta.aceptaMovimiento).toBe(true)
    expect(() => cuentaCrearSchema.parse({ codigo: '', nombre: 'x', tipo: 'GASTO', naturaleza: 'DEUDORA' })).toThrow()
    expect(() => cuentaCrearSchema.parse({ codigo: '5300', nombre: 'Papelería', tipo: 'OTRO', naturaleza: 'DEUDORA' })).toThrow()
    expect(cuentaModificarSchema.safeParse({ id: 1 }).success).toBe(false)
    expect(cuentaEstadoSchema.parse({ id: 1, activa: false }).activa).toBe(false)
  })

  it('valida asientos, periodos y mayor', () => {
    const asiento = asientoCrearSchema.parse({
      fecha: '2026-11-24', descripcion: 'Venta del día', lineas: [
        { cuentaId: 1, debeCent: 1000, haberCent: 0 },
        { cuentaId: 2, debeCent: 0, haberCent: 1000 }
      ]
    })
    expect(asiento.tipo).toBe('MANUAL')
    expect(asiento.lineas[0].descripcion).toBe('')
    expect(() => asientoCrearSchema.parse({
      fecha: '2026-11-24', descripcion: 'Una línea', lineas: [{ cuentaId: 1, debeCent: 1, haberCent: 0 }]
    })).toThrow()
    expect(() => asientoCrearSchema.parse({
      fecha: '2026-11-24', descripcion: 'Centavos fraccionarios', lineas: [
        { cuentaId: 1, debeCent: 1.5, haberCent: 0 }, { cuentaId: 2, debeCent: 0, haberCent: 1 }
      ]
    })).toThrow()
    expect(asientoEstadoSchema.parse({ id: 1, estado: 'ANULAR' }).estado).toBe('ANULAR')
    expect(() => periodoAbrirSchema.parse({ anio: 1999, mes: 1 })).toThrow()
    expect(periodoCerrarSchema.parse({ id: 7 }).id).toBe(7)
    expect(mayorSchema.parse({ cuentaId: 3 }).cuentaId).toBe(3)
  })

  it('el plan base es único, jerárquico y equilibrado por naturaleza', () => {
    const codigos = planCuentasBase.map((c) => c.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
    expect(planCuentasBase.length).toBeGreaterThan(15)
    for (const cuenta of planCuentasBase) {
      expect(tiposCuenta).toContain(cuenta.tipo)
      expect(naturalezas).toContain(cuenta.naturaleza)
      if (cuenta.nivel === 1) expect(cuenta.aceptaMovimiento).toBe(false)
      else expect(cuenta.aceptaMovimiento).toBe(true)
      const padre = padresPlanCuentasBase[cuenta.codigo]
      if (padre) expect(codigos).toContain(padre)
    }
    expect(planCuentasBase.find((c) => c.codigo === '4110')?.nombre).toContain('ITBIS')
  })
})

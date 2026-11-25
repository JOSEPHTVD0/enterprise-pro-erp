import { describe, it, expect } from 'vitest'
import {
  ajustesSaveSchema, defaultAjustes, featureFlagsSchema, modulosProtegidos
} from '@shared/schemas/ajustes'

describe('esquemas del centro de control', () => {
  it('produce defaults válidos para los diez grupos', () => {
    expect(Object.keys(defaultAjustes)).toHaveLength(10)
    expect(defaultAjustes.alertas.stockBajoUmbral).toBe(5)
    expect(defaultAjustes.widgets.widgets).toHaveLength(13)
    expect(defaultAjustes.featureFlags.modulos.length).toBeGreaterThan(20)
  })

  it('rechaza umbrales y formatos fuera de rango', () => {
    expect(() => ajustesSaveSchema.parse({
      grupo: 'alertas', datos: { ...defaultAjustes.alertas, stockBajoUmbral: -1 }
    })).toThrow()
    expect(() => ajustesSaveSchema.parse({
      grupo: 'integraciones', datos: { ...defaultAjustes.integraciones, carpetaExportacion: 'C:\\secretos' }
    })).toThrow()
    expect(() => ajustesSaveSchema.parse({
      grupo: 'widgets', datos: { ...defaultAjustes.widgets, widgets: [] }
    })).not.toThrow()
  })

  it('protege los módulos esenciales de los feature flags', () => {
    const modulos = defaultAjustes.featureFlags.modulos.map((m) => ({
      ...m, activo: modulosProtegidos.includes(m.modulo as never) ? false : m.activo
    }))
    expect(() => featureFlagsSchema.parse({ modulos })).toThrow()
  })

  it('acepta un cambio válido de widgets y tema', () => {
    const widgets = defaultAjustes.widgets.widgets.map((w, i) => ({ ...w, orden: 12 - i, visible: i < 3 }))
    expect(ajustesSaveSchema.parse({ grupo: 'widgets', datos: { ...defaultAjustes.widgets, widgets } }).grupo).toBe('widgets')
    expect(ajustesSaveSchema.parse({
      grupo: 'tema', datos: { ...defaultAjustes.tema, escala: 1.2, altoContraste: true }
    }).grupo).toBe('tema')
  })
})

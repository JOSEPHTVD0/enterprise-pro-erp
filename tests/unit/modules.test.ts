import { describe, it, expect } from 'vitest'
import { allModules, findModule, moduleGroups } from '@/app/modules'

describe('catálogo de módulos', () => {
  it('tiene ids únicos', () => {
    const ids = allModules.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todos los módulos tienen etiqueta, descripción y fase válida', () => {
    for (const m of allModules) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.description.length).toBeGreaterThan(0)
      expect(m.phase).toBeGreaterThanOrEqual(2)
      expect(m.phase).toBeLessThanOrEqual(12)
    }
  })

  it('los módulos pendientes declaran su alcance (sin placeholders vacíos)', () => {
    for (const m of allModules.filter((x) => !x.available)) {
      expect(m.features.length).toBeGreaterThan(0)
    }
  })

  it('los módulos activos al cierre de la Fase 10 son los previstos', () => {
    const active = allModules.filter((m) => m.available).map((m) => m.id)
    expect(active.sort()).toEqual([
      'apariencia', 'auditoria', 'bancos', 'cajas', 'catalogos', 'clientes', 'compras',
      'configuracion', 'cotizaciones', 'cxc', 'cxp', 'dashboard', 'facturacion', 'gastos',
      'inventario', 'pos', 'productos', 'proveedores', 'reportes', 'respaldos', 'roles',
      'usuarios', 'vendedores'
    ])
  })

  it('findModule encuentra todos los módulos del catálogo', () => {
    for (const g of moduleGroups) {
      for (const m of g.modules) {
        expect(findModule(m.id)).toBe(m)
      }
    }
    expect(findModule('inexistente')).toBeUndefined()
  })
})

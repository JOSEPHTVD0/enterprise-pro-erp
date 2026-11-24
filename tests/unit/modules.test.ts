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
      expect(m.phase).toBeLessThanOrEqual(13)
    }
  })

  it('los módulos pendientes declaran su alcance (sin placeholders vacíos)', () => {
    for (const m of allModules.filter((x) => !x.available)) {
      expect(m.features.length).toBeGreaterThan(0)
    }
  })

  it('los módulos activos en 0.3.0 son los previstos', () => {
    const active = allModules.filter((m) => m.available).map((m) => m.id)
    expect(active.sort()).toEqual([
      'activos', 'apariencia', 'auditoria', 'bancos', 'cajas', 'catalogos', 'clientes', 'compras',
      'configuracion', 'configuracion-avanzada', 'cotizaciones', 'crm', 'cxc', 'cxp',
      'dashboard', 'dashboard-ejecutivo', 'facturacion', 'gastos', 'inventario', 'pos',
      'presupuestos', 'productos', 'proveedores', 'reportes', 'respaldos', 'roles',
      'salud', 'servicios', 'usuarios', 'vendedores'
    ])
  })

  it('todo módulo disponible con permiso existe en el catálogo de permisos', async () => {
    const { permissionKeys } = await import('@shared/permissions')
    for (const m of allModules.filter((x) => x.available && x.permission)) {
      expect(permissionKeys).toContain(m.permission)
    }
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

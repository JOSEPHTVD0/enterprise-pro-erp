import { describe, it, expect } from 'vitest'
import { allModules, findModule, moduleGroups, modulePermission } from '@/app/modules'

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
      expect(m.phase).toBeLessThanOrEqual(15)
    }
  })

  it('los módulos pendientes declaran su alcance (sin placeholders vacíos)', () => {
    for (const m of allModules.filter((x) => !x.available)) {
      expect(m.features.length).toBeGreaterThan(0)
    }
  })

  it('los módulos activos son los previstos', () => {
    const active = allModules.filter((m) => m.available).map((m) => m.id)
    expect(active.sort()).toEqual([
      'activos', 'agenda', 'apariencia', 'auditoria', 'bancos', 'cajas', 'capacidades-2026',
      'catalogos', 'centro-control', 'centro-impresion', 'clientes', 'cobros', 'compras', 'configuracion',
      'configuracion-avanzada', 'contabilidad', 'control-stock', 'cotizaciones', 'crm', 'cxc', 'cxp',
      'dashboard', 'dashboard-ejecutivo', 'espacio-trabajo', 'facturacion', 'gastos', 'inteligencia',
      'inventario', 'panel-2026', 'panel-comercial', 'pos', 'presupuestos', 'productos', 'proveedores', 'reportes', 'respaldos',
      'roles', 'salud', 'servicios', 'usuarios', 'vendedores'
    ])
  })

  it('todo módulo disponible tiene un permiso real en el catálogo', async () => {
    const { permissionKeys } = await import('@shared/permissions')
    for (const m of allModules.filter((x) => x.available)) {
      const permiso = modulePermission(m.id)
      if (permiso) expect(permissionKeys).toContain(permiso)
    }
  })

  it('las vistas de acceso general no exigen un permiso de módulo inexistente', () => {
    expect(modulePermission('apariencia')).toBeUndefined()
    expect(modulePermission('agenda')).toBeUndefined()
    expect(modulePermission('control-stock')).toBe('inventario.consultar')
    expect(modulePermission('panel-comercial')).toBe('reportes.consultar')
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

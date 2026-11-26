import { describe, it, expect } from 'vitest'
import type { SessionContext } from '@shared/session'
import { defaultSettings, type Settings } from '@shared/settings'
import { defaultAjustes } from '@shared/schemas/ajustes'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { createPanel2026Service } from '../../src/main/services/panel2026.service'
import { createDashboardEjecutivoService } from '../../src/main/services/dashboard-ejecutivo.service'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)
const fechaRel = (dias: number): string =>
  new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)

const filtro = {
  vista: 'OPERATIVA' as const,
  periodo: 'ANIO' as const,
  metricaPrincipal: 'VENTAS' as const
}

function setup(cargar?: () => Settings) {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'PC-PANEL-2026')
  const ctx = login.context as SessionContext
  const ajustes = createAjustesService(db)
  const loader = cargar ?? (() => defaultSettings)
  return {
    db,
    ctx,
    ajustes,
    panel: createPanel2026Service(db, ajustes, loader),
    ejecutivo: createDashboardEjecutivoService(db, ajustes, loader)
  }
}

function cliente(db: ReturnType<typeof testDb>, codigo: string, nombre: string): number {
  return Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, ?, ?)
  `).run(codigo, nombre).lastInsertRowid)
}

function venta(
  db: ReturnType<typeof testDb>,
  numero: string,
  clienteId: number,
  nombre: string,
  totalCent: number,
  costoCent: number,
  fecha: string = fechaRel(0)
): number {
  return Number(db.prepare(`
    INSERT INTO documentos_venta (
      empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha,
      total_cent, costo_total_cent, estado
    ) VALUES (1, 'FACTURA_CONTADO', ?, ?, ?, ?, ?, ?, 'ACTIVO')
  `).run(numero, clienteId, nombre, fecha, totalCent, costoCent).lastInsertRowid)
}

describe('panel 2026 — servicios compartidos', () => {
  it('exige inteligencia.consultar en el backend', () => {
    const { db, ctx, panel } = setup()
    const sinPermiso: SessionContext = {
      ...ctx, permisos: ctx.permisos.filter((p) => p !== 'inteligencia.consultar')
    }
    expect(() => panel.resumen(sinPermiso, filtro)).toThrow(/permiso/i)
    db.close()
  })

  it('calcula KPIs con documentos reales y respeta la utilidad de la estación', () => {
    const { db, ctx, panel } = setup()
    const id = cliente(db, 'CLI-P26-KPI', 'Cliente Panel 2026')
    const ventaId = venta(db, 'FAC-P26-KPI', id, 'Cliente Panel 2026', 150000, 90000)
    db.prepare(`
      INSERT INTO cxc_recibos (empresa_id, numero, cliente_id, cliente_nombre, fecha, monto_cent)
      VALUES (1, 'REC-P26-KPI', ?, 'Cliente Panel 2026', ?, 2000)
    `).run(id, fechaRel(0))
    db.prepare(`
      INSERT INTO cxc_documentos (
        empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento,
        monto_cent, saldo_cent, estado
      ) VALUES (1, ?, ?, 'FAC-P26-KPI', ?, ?, 150000, 90000, 'PENDIENTE')
    `).run(id, ventaId, fechaRel(0), fechaRel(-3))

    const datos = panel.resumen(ctx, filtro) as {
      kpis: Fila
      envejecimiento: { bucket: string; documentos: number }[]
      config: Fila
    }
    expect(n(datos.kpis, 'ventasCent')).toBe(150000)
    expect(n(datos.kpis, 'cobrosCent')).toBe(2000)
    expect(n(datos.kpis, 'cxcSaldoCent')).toBe(90000)
    expect(n(datos.kpis, 'cxcVencido')).toBe(1)
    expect(n(datos.kpis, 'utilidadCent')).toBe(60000)
    expect(n(datos.kpis, 'margenBp')).toBe(4000)
    expect(datos.envejecimiento.map((b) => b.bucket)).toEqual([
      'AL_DIA', 'POR_VENCER', 'VENCIDO', 'CRITICO'
    ])
    expect(datos.envejecimiento.reduce((suma, b) => suma + b.documentos, 0)).toBe(1)
    expect(datos.config.diasProyeccion).toBe(28)
    db.close()
  })

  it('aplica filas de panel2026 a los rankings', () => {
    const { db, ctx, ajustes, panel } = setup()
    for (let i = 1; i <= 5; i += 1) {
      const id = cliente(db, `CLI-P26-F${i}`, `Cliente Fila ${i}`)
      venta(db, `FAC-P26-F${i}`, id, `Cliente Fila ${i}`, 1000 * i, 500 * i)
    }
    ajustes.save(ctx, {
      grupo: 'panel2026', datos: { ...defaultAjustes.panel2026, filas: 3 }
    })
    const datos = panel.resumen(ctx, filtro) as {
      topClientes: unknown[]
      config: { filas: number }
    }
    expect(datos.topClientes).toHaveLength(3)
    expect(datos.config.filas).toBe(3)
    db.close()
  })

  it('aplica diasProyeccion y umbralStockBajo de panel2026', () => {
    const { db, ctx, ajustes, panel } = setup()
    const id = cliente(db, 'CLI-P26-PROY', 'Cliente Proyección')
    const ventaId = venta(db, 'FAC-P26-PROY', id, 'Cliente Proyección', 50000, 30000)
    const proveedorId = Number(db.prepare(`
      INSERT INTO proveedores (empresa_id, codigo, nombre_comercial) VALUES (1, 'PRO-P26', 'Proveedor Panel')
    `).run().lastInsertRowid)
    const compraId = Number(db.prepare(`
      INSERT INTO documentos_compra (
        empresa_id, tipo, numero, proveedor_id, proveedor_nombre, total_cent, estado
      ) VALUES (1, 'FACTURA_COMPRA', 'COM-P26-PROY', ?, 'Proveedor Panel', 20000, 'COMPLETO')
    `).run(proveedorId).lastInsertRowid)
    db.prepare(`
      INSERT INTO cxc_documentos (
        empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento,
        monto_cent, saldo_cent, estado
      ) VALUES (1, ?, ?, 'FAC-P26-PROY', ?, ?, 50000, 50000, 'PENDIENTE')
    `).run(id, ventaId, fechaRel(0), fechaRel(5))
    db.prepare(`
      INSERT INTO cxp_documentos (
        empresa_id, proveedor_id, doc_compra_id, numero_documento, fecha, vencimiento,
        monto_cent, saldo_cent, estado
      ) VALUES (1, ?, ?, 'COM-P26-PROY', ?, ?, 20000, 20000, 'PENDIENTE')
    `).run(proveedorId, compraId, fechaRel(0), fechaRel(40))
    const almacenId = Number((db.prepare('SELECT id FROM almacenes WHERE empresa_id = 1 LIMIT 1').get() as Fila).id)
    const productoId = Number(db.prepare(`
      INSERT INTO productos (empresa_id, codigo, descripcion) VALUES (1, 'PROD-P26', 'Producto Panel')
    `).run().lastInsertRowid)
    db.prepare(`
      INSERT INTO existencias (empresa_id, producto_id, almacen_id, cantidad) VALUES (1, ?, ?, 7)
    `).run(productoId, almacenId)

    const antes = panel.resumen(ctx, filtro) as { kpis: Fila; proyeccion: Fila[] }
    expect(n(antes.kpis, 'stockBajo')).toBe(0)
    expect(antes.proyeccion).toHaveLength(1)
    expect(antes.proyeccion[0].fecha).toBe(fechaRel(5))
    expect(n(antes.proyeccion[0], 'montoCent')).toBe(50000)

    ajustes.save(ctx, {
      grupo: 'panel2026',
      datos: { ...defaultAjustes.panel2026, diasProyeccion: 45, umbralStockBajo: 10 }
    })
    const despues = panel.resumen(ctx, filtro) as {
      kpis: Fila
      proyeccion: Fila[]
      config: Fila
    }
    expect(n(despues.kpis, 'stockBajo')).toBe(1)
    expect(despues.proyeccion).toHaveLength(2)
    expect(despues.proyeccion.some((f) => f.fecha === fechaRel(40) && n(f, 'montoCent') === -20000)).toBe(true)
    expect(despues.config.diasProyeccion).toBe(45)
    expect(despues.config.umbralStockBajo).toBe(10)
    db.close()
  })

  it('anula utilidad cuando la estación desactiva verUtilidad', () => {
    const sinUtilidad = (): Settings => ({
      ...defaultSettings,
      panel: { ...defaultSettings.panel, verUtilidad: false }
    })
    const { db, ctx, panel } = setup(sinUtilidad)
    const id = cliente(db, 'CLI-P26-SIN', 'Cliente Sin Utilidad')
    venta(db, 'FAC-P26-SIN', id, 'Cliente Sin Utilidad', 120000, 70000)
    const datos = panel.resumen(ctx, filtro) as { kpis: Fila }
    expect(datos.kpis.utilidadCent).toBeNull()
    expect(datos.kpis.margenBp).toBeNull()
    db.close()
  })

  it('usa la vista y métrica administrativas como defaults y compara el periodo anterior', () => {
    const { db, ctx, ajustes, panel } = setup()
    const id = cliente(db, 'CLI-P26-COMP', 'Cliente Comparación')
    const anterior = new Date(Date.now() - 370 * 86_400_000).toISOString().slice(0, 10)
    venta(db, 'FAC-P26-COMP-ANT', id, 'Cliente Comparación', 100000, 60000, anterior)
    venta(db, 'FAC-P26-COMP-ACT', id, 'Cliente Comparación', 150000, 90000)
    ajustes.save(ctx, {
      grupo: 'panel2026',
      datos: {
        ...defaultAjustes.panel2026,
        vista: 'RIESGO', metricaPrincipal: 'CXC', compararPeriodo: true
      }
    })

    const datos = panel.resumen(ctx, { periodo: 'ANIO' } as never) as {
      config: Fila
      comparacion: { ventas: Fila } | null
    }
    expect(datos.config.vista).toBe('RIESGO')
    expect(datos.config.metricaPrincipal).toBe('CXC')
    expect(datos.config.compararPeriodo).toBe(true)
    expect(n(datos.comparacion?.ventas ?? {}, 'anteriorCent')).toBe(100000)
    expect(n(datos.comparacion?.ventas ?? {}, 'deltaCent')).toBe(50000)
    db.close()
  })

  it('el panel ejecutivo expone serieDiaria, preferencias y mantiene serieMensual', () => {
    const { db, ctx, ejecutivo } = setup()
    const id = cliente(db, 'CLI-P26-EJEC', 'Cliente Ejecutivo')
    venta(db, 'FAC-P26-EJEC', id, 'Cliente Ejecutivo', 80000, 50000, fechaRel(0))
    venta(db, 'FAC-P26-EJEC-ANT', id, 'Cliente Ejecutivo', 40000, 25000, fechaRel(-40))
    const datos = ejecutivo.resumen(ctx, { periodo: 'ANIO' }) as {
      serieDiaria: { clave: string; ventasCent: number }[]
      serieMensual: { clave: string; ventasCent: number }[]
      preferencias: { verUtilidad: boolean; filasDashboard: number; filasPanel: number }
      config: { stockBajoUmbral: number; cxcDiasVencimiento: number }
    }
    expect(datos.serieDiaria.some((dia) => dia.clave === fechaRel(0) && dia.ventasCent === 80000)).toBe(true)
    expect(datos.serieMensual.reduce((suma, mes) => suma + mes.ventasCent, 0)).toBe(120000)
    expect(datos.preferencias.verUtilidad).toBe(true)
    expect(datos.preferencias.filasDashboard).toBe(8)
    expect(datos.preferencias.filasPanel).toBe(8)
    expect(datos.config.stockBajoUmbral).toBe(5)
    expect(datos.config.cxcDiasVencimiento).toBe(15)
    db.close()
  })
})

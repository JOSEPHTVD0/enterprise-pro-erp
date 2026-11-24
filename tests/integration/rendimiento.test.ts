import { describe, expect, it } from 'vitest'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createReportesService } from '../../src/main/services/reportes.service'
import type { SessionContext } from '@shared/session'
import { testDb } from '../helpers/db'

type Fila = Record<string, unknown>

describe('Fase 11 — rendimiento con 10k productos y 1k documentos', () => {
  it('inserta, lista y consulta 10.000 productos con índices sobre SQLite real', () => {
    const db = testDb()
    const ctx = createAuthService(db)
      .login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'F11-REND').context as SessionContext
    const maestros = createMaestrosService(db)

    const inicio = performance.now()
    const insertar = db.prepare(`
      INSERT INTO productos (empresa_id, codigo, descripcion, tipo, precio1_cent, costo_promedio_cent, activo)
      VALUES (1, ?, ?, 'FISICO', 10000, 6000, 1)
    `)
    db.transaction(() => {
      for (let i = 1; i <= 10_000; i += 1) {
        insertar.run(`REND-${String(i).padStart(5, '0')}`, `Producto masivo ${i}`)
      }
    })()
    const insercionMs = performance.now() - inicio

    const antesListar = performance.now()
    const filas = maestros.list(ctx, { entidad: 'productos', incluirInactivos: false }) as Fila[]
    const listadoMs = performance.now() - antesListar
    expect(filas.length).toBe(10_000)
    expect(filas.some((f) => f.codigo === 'REND-09999')).toBe(true)

    const plan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT id FROM productos WHERE empresa_id = 1 AND activo = 1
    `).all() as { detail: string }[]
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/idx_productos_empresa|USING INDEX/i)
    expect(insercionMs).toBeLessThan(15_000)
    expect(listadoMs).toBeLessThan(8_000)
    db.close()
  }, 30_000)

  it('agrega 1.000 documentos reales sin perder totales ni cuadre', () => {
    const db = testDb()
    const ctx = createAuthService(db)
      .login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'F11-REND').context as SessionContext
    const hoy = new Date().toISOString().slice(0, 10)
    const clienteId = Number(db.prepare(`
      INSERT INTO clientes (empresa_id, codigo, nombre, tipo) VALUES (1, 'CLI-MASIVO', 'Cliente Masivo', 'EMPRESA')
    `).run().lastInsertRowid)

    const inicio = performance.now()
    const insertar = db.prepare(`
      INSERT INTO documentos_venta (
        empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, estado,
        subtotal_cent, descuento_cent, impuesto_cent, total_cent
      ) VALUES (1, 'FACTURA_CREDITO', ?, ?, ?, ?, 'ACTIVO', 10000, 0, 1800, 11800)
    `)
    db.transaction(() => {
      for (let i = 1; i <= 1_000; i += 1) {
        insertar.run(`FCR-MASIVA-${String(i).padStart(4, '0')}`, clienteId, 'Cliente Masivo', hoy)
      }
    })()
    const insercionMs = performance.now() - inicio

    const reportes = createReportesService(db)
    const antes = performance.now()
    const ventas = reportes.datosReporte(ctx, 'VENTAS', { fechaDesde: hoy, fechaHasta: hoy, limite: 1000 }) as unknown as Fila
    const consultaMs = performance.now() - antes
    const filas = ventas.filas as Fila[]
    expect(filas.length).toBe(1_000)
    expect(ventas.registros).toBe(1_000)
    expect(filas.reduce((sum, f) => sum + Number(f.totalCent), 0)).toBe(11_800_000)

    const plan = db.prepare(`
      EXPLAIN QUERY PLAN SELECT id FROM documentos_venta WHERE empresa_id = 1 AND fecha >= ?
    `).all(hoy) as { detail: string }[]
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/idx_docs_venta_empresa_fecha|USING INDEX/i)
    expect(insercionMs).toBeLessThan(15_000)
    expect(consultaMs).toBeLessThan(8_000)
    db.close()
  }, 30_000)
})

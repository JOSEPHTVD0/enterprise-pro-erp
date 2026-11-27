import { describe, expect, it } from 'vitest'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createComprasService } from '../../src/main/services/compras.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createReportesService } from '../../src/main/services/reportes.service'
import { createVentasService } from '../../src/main/services/ventas.service'
import type { SessionContext } from '@shared/session'
import { testDb } from '../helpers/db'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'EXP-PC').context as SessionContext
  const maestros = createMaestrosService(db)
  const inventario = createInventarioService(db)
  const ventas = createVentasService(db, inventario)
  const compras = createComprasService(db, inventario)
  const finanzas = createFinanzasService(db)
  const reportes = createReportesService(db)
  return { db, ctx, maestros, inventario, ventas, compras, finanzas, reportes }
}

function exportaciones(db: ReturnType<typeof testDb>, entidad: string): Fila[] {
  return db.prepare(`
    SELECT * FROM auditoria WHERE operacion = 'EXPORTAR' AND entidad = ? ORDER BY id
  `).all(entidad) as Fila[]
}

describe('auditoría real de exportaciones', () => {
  it('registra cada exportación auditable con filtro, registro y archivo', async () => {
    const { db, ctx, maestros, inventario, ventas, compras, finanzas, reportes } = setup()

    await maestros.exportar(ctx, 'clientes')
    await inventario.exportar(ctx, 'existencias', {})
    await inventario.exportar(ctx, 'kardex', {})
    await ventas.exportar(ctx, {})
    await compras.exportar(ctx, {})
    await finanzas.cxcExportar(ctx, {})
    await finanzas.cobrosExportar(ctx, {})
    await finanzas.cxpExportar(ctx, {})
    await reportes.exportar(ctx, { reporte: 'VENTAS', formato: 'XLSX' })
    await reportes.exportar(ctx, { reporte: 'VENTAS', formato: 'CSV' })

    const entidades = [
      'clientes', 'existencias', 'kardex', 'documentos_venta', 'documentos_compra',
      'cxc', 'cxp', 'VENTAS'
    ]
    for (const entidad of entidades) {
      const filas = exportaciones(db, entidad)
      expect(filas.length, entidad).toBeGreaterThan(0)
      for (const fila of filas) {
        expect(Number(fila.empresa_id)).toBe(ctx.empresaId)
        expect(Number(fila.usuario_id)).toBe(ctx.userId)
        const despues = JSON.parse(String(fila.valores_despues)) as Record<string, unknown>
        expect(despues.filename).toBeTruthy()
        expect(Number(despues.registros)).toBeGreaterThanOrEqual(0)
      }
    }

    expect(exportaciones(db, 'cxc')).toHaveLength(2)
    expect(exportaciones(db, 'VENTAS')).toHaveLength(2)
    expect(JSON.parse(String(exportaciones(db, 'cxc')[1].valores_despues)))
      .toMatchObject({ permiso: 'cobros.exportar' })
    db.close()
  })

  it('no audita una exportación rechazada por falta de permiso', async () => {
    const { db, ctx, reportes } = setup()
    const sinPermiso: SessionContext = {
      ...ctx, permisos: ctx.permisos.filter((p) => p !== 'reportes.exportar')
    }

    await expect(reportes.exportar(sinPermiso, { reporte: 'VENTAS', formato: 'XLSX' })).rejects.toThrow(/permiso/i)
    expect(exportaciones(db, 'VENTAS')).toEqual([])
    db.close()
  })
})

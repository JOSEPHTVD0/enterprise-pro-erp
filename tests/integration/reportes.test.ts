import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createReportesService } from '../../src/main/services/reportes.service'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC').context as SessionContext
  const reportes = createReportesService(db)
  const hoy = new Date().toISOString().slice(0, 10)
  const almacenId = Number((db.prepare('SELECT id FROM almacenes WHERE empresa_id = 1 LIMIT 1').get() as Fila).id)

  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre, tipo, rnc_cedula)
    VALUES (1, 'CLI-REP', 'Cliente Reportes', 'EMPRESA', '101111111')
  `).run().lastInsertRowid)
  const proveedorId = Number(db.prepare(`
    INSERT INTO proveedores (empresa_id, codigo, nombre_comercial, razon_social, rnc)
    VALUES (1, 'PRO-REP', 'Proveedor Reportes', 'Proveedor Reportes SRL', '102222222')
  `).run().lastInsertRowid)
  const productoId = Number(db.prepare(`
    INSERT INTO productos (empresa_id, codigo, descripcion, tipo) VALUES (1, 'PROD-REP', 'Producto Reportes', 'FISICO')
  `).run().lastInsertRowid)
  const productoAgotadoId = Number(db.prepare(`
    INSERT INTO productos (empresa_id, codigo, descripcion, tipo) VALUES (1, 'PROD-AGO', 'Producto Agotado', 'FISICO')
  `).run().lastInsertRowid)

  db.prepare('INSERT INTO existencias (empresa_id, producto_id, almacen_id, cantidad, valor_cent) VALUES (1, ?, ?, 10, 90000)')
    .run(productoId, almacenId)
  db.prepare('INSERT INTO existencias (empresa_id, producto_id, almacen_id, cantidad, valor_cent) VALUES (1, ?, ?, 0, 0)')
    .run(productoAgotadoId, almacenId)

  const ventaId = Number(db.prepare(`
    INSERT INTO documentos_venta (
      empresa_id, tipo, numero, es_ncf, cliente_id, cliente_nombre, cliente_rnc, fecha, estado,
      subtotal_cent, descuento_cent, impuesto_cent, total_cent, costo_total_cent
    ) VALUES (1, 'FACTURA_CREDITO', 'FCR-REP-1', 1, ?, ?, '101111111', ?, 'ACTIVO', 12000, 0, 3000, 15000, 9000)
  `).run(clienteId, 'Cliente Reportes', hoy).lastInsertRowid)
  db.prepare(`
    INSERT INTO documentos_venta (
      empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, estado,
      subtotal_cent, impuesto_cent, total_cent, costo_total_cent, doc_origen_id
    ) VALUES (1, 'NOTA_CREDITO', 'NC-REP-1', ?, ?, ?, 'ACTIVO', 1600, 400, 2000, 0, ?)
  `).run(clienteId, 'Cliente Reportes', hoy, ventaId)
  db.prepare(`
    INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, fecha, estado, total_cent)
    VALUES (1, 'COTIZACION', 'COT-REP-1', ?, ?, ?, 'PENDIENTE', 999999)
  `).run(clienteId, 'Cliente Reportes', hoy)

  const compraId = Number(db.prepare(`
    INSERT INTO documentos_compra (
      empresa_id, tipo, numero, numero_proveedor, proveedor_id, proveedor_nombre, proveedor_rnc,
      fecha, estado, subtotal_cent, impuesto_cent, total_cent
    ) VALUES (1, 'FACTURA_COMPRA', 'FCO-REP-1', 'B0100000001', ?, ?, '102222222', ?, 'CONTABILIZADO', 8000, 2000, 10000)
  `).run(proveedorId, 'Proveedor Reportes', hoy).lastInsertRowid)
  db.prepare(`
    INSERT INTO documentos_compra (
      empresa_id, tipo, numero, numero_proveedor, proveedor_id, proveedor_nombre, proveedor_rnc,
      fecha, estado, subtotal_cent, impuesto_cent, total_cent, doc_origen_id
    ) VALUES (1, 'DEVOLUCION_COMPRA', 'DEV-REP-1', 'B0100000002', ?, ?, '102222222', ?, 'CONTABILIZADO', 800, 200, 1000, ?)
  `).run(proveedorId, 'Proveedor Reportes', hoy, compraId)

  const cxcId = Number(db.prepare(`
    INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FCR-REP-1', ?, '2027-01-01', 15000, 5000, 'PENDIENTE')
  `).run(clienteId, ventaId, hoy).lastInsertRowid)
  const cxpId = Number(db.prepare(`
    INSERT INTO cxp_documentos (empresa_id, proveedor_id, doc_compra_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FCO-REP-1', ?, '2027-01-01', 10000, 4000, 'PENDIENTE')
  `).run(proveedorId, compraId, hoy).lastInsertRowid)

  db.prepare(`
    INSERT INTO cxc_recibos (empresa_id, numero, cliente_id, cliente_nombre, fecha, monto_cent, metodo, estado)
    VALUES (1, 'RIN-REP-1', ?, ?, ?, 7000, 'EFECTIVO', 'CONTABILIZADO')
  `).run(clienteId, 'Cliente Reportes', hoy)
  db.prepare(`
    INSERT INTO cxp_pagos (empresa_id, numero, proveedor_id, proveedor_nombre, fecha, monto_cent, metodo, estado)
    VALUES (1, 'PAG-REP-1', ?, ?, ?, 3000, 'TRANSFERENCIA', 'CONTABILIZADO')
  `).run(proveedorId, 'Proveedor Reportes', hoy)

  const sin = (permiso: string): SessionContext => ({
    ...ctx, permisos: ctx.permisos.filter((p) => p !== permiso)
  })
  const con = (permiso: string): SessionContext => ({
    ...ctx, permisos: [...new Set([...ctx.permisos, permiso])]
  })

  return { db, ctx, reportes, hoy, cxcId, cxpId, sin, con }
}

describe('Fase 9 — reportes y estadísticas', () => {
  it('los indicadores leen totales reales de ventas, compras, CxC, CxP, caja e inventario', () => {
    const s = setup()
    const datos = s.reportes.indicadores(s.ctx)
    expect(datos.moneda).toBe('DOP')
    expect(datos.ventasHoyCent).toBe(13000)
    expect(datos.ventasMesCent).toBe(13000)
    expect(datos.comprasMesCent).toBe(9000)
    expect(datos.cxcSaldoCent).toBe(5000)
    expect(datos.cxpSaldoCent).toBe(4000)
    expect(datos.productosAgotados).toBe(1)
    expect(datos.gananciaMesCent).toBe(6000)
    expect(datos.cajaAbierta).toBeNull()
    expect(() => s.reportes.indicadores(s.sin('reportes.consultar'))).toThrow(/permiso/i)
    s.db.close()
  })

  it('la ganancia se oculta sin reportes.ganancia y la serie agrupa importes reales', () => {
    const s = setup()
    const sinGanancia = s.reportes.indicadores(s.sin('reportes.ganancia'))
    expect(sinGanancia.gananciaMesCent).toBeNull()

    const serie = s.reportes.serie(s.ctx, {
      fechaDesde: s.hoy, fechaHasta: s.hoy, granularidad: 'DIA'
    })
    expect(serie.puntos).toHaveLength(1)
    expect(serie.puntos[0]).toMatchObject({
      clave: s.hoy, ventasCent: 13000, comprasCent: 9000, cobrosCent: 7000, pagosCent: 3000
    })
    expect(() => s.reportes.serie(s.sin('reportes.consultar'), {})).toThrow(/permiso/i)
    s.db.close()
  })

  it('el reporte de ventas oculta costo y ganancia sin esos permisos', () => {
    const s = setup()
    const publico = s.reportes.datosReporte(s.sin('reportes.costo'), 'VENTAS')
    expect(publico.registros).toBe(2)
    expect(publico.columnas.some((c) => c.key === 'costoTotalCent')).toBe(false)
    expect(publico.filas[0].costoTotalCent).toBeUndefined()
    expect(publico.totales.totalCent).toBe(13000)

    const completo = s.reportes.datosReporte(s.con('reportes.costo'), 'VENTAS')
    const conGanancia = s.reportes.datosReporte(s.con('reportes.ganancia'), 'VENTAS')
    expect(completo.columnas.some((c) => c.key === 'costoTotalCent')).toBe(true)
    expect(conGanancia.columnas.some((c) => c.key === 'gananciaCent')).toBe(true)
    s.db.close()
  })

  it('los libros 606 y 607 derivan NCF y aplican signo a devoluciones y notas de crédito', () => {
    const s = setup()
    const libro606 = s.reportes.datosReporte(s.ctx, 'LIBRO606')
    expect(libro606.titulo).toContain('606')
    expect(libro606.filas).toHaveLength(2)
    expect(libro606.filas.find((f) => f.ncfProveedor === 'B0100000001')?.totalCent).toBe(10000)
    expect(libro606.filas.find((f) => f.ncfProveedor === 'B0100000002')?.totalCent).toBe(-1000)
    expect(libro606.totales.totalCent).toBe(9000)

    const libro607 = s.reportes.datosReporte(s.ctx, 'LIBRO607')
    expect(libro607.titulo).toContain('607')
    expect(libro607.filas).toHaveLength(2)
    expect(libro607.filas.find((f) => f.numero === 'FCR-REP-1')?.esNcf).toBe('SÍ')
    expect(libro607.filas.find((f) => f.numero === 'NC-REP-1')?.totalCent).toBe(-2000)
    expect(libro607.totales.totalCent).toBe(13000)
    s.db.close()
  })

  it('los reportes de CxC y CxP exigen además el permiso del módulo financiero', () => {
    const s = setup()
    expect(s.reportes.datosReporte(s.ctx, 'CXC').totales.saldoCent).toBe(5000)
    expect(s.reportes.datosReporte(s.ctx, 'CXP').totales.saldoCent).toBe(4000)
    expect(() => s.reportes.datosReporte(s.sin('cxc.consultar'), 'CXC')).toThrow(/permiso/i)
    expect(() => s.reportes.datosReporte(s.sin('cxp.consultar'), 'CXP')).toThrow(/permiso/i)
    s.db.close()
  })

  it('exporta XLSX y CSV reales y verifica permiso de exportación', async () => {
    const s = setup()
    const xlsx = await s.reportes.exportar(s.ctx, { reporte: 'VENTAS', formato: 'XLSX' })
    expect(xlsx.filename).toMatch(/^reporte_ventas_\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(xlsx.mime).toContain('spreadsheetml')
    expect(Buffer.from(xlsx.base64, 'base64').length).toBeGreaterThan(3000)

    const csv = await s.reportes.exportar(s.ctx, { reporte: 'LIBRO606', formato: 'CSV' })
    const texto = Buffer.from(csv.base64, 'base64').toString('utf8')
    expect(csv.mime).toContain('text/csv')
    expect(texto).toContain('NCF proveedor')
    expect(texto).toContain('B0100000001')

    await expect(s.reportes.exportar(s.sin('reportes.exportar'), {
      reporte: 'VENTAS', formato: 'XLSX'
    })).rejects.toThrow(/permiso/i)
    s.db.close()
  })

  it('entrega datos de impresión con aviso explícito de no certificación DGII', () => {
    const s = setup()
    const datos = s.reportes.imprimir(s.ctx, { reporte: 'LIBRO607' })
    expect(datos.titulo).toContain('607')
    expect(datos.registros).toBe(2)
    expect(datos.aviso).toContain('no constituye certificación DGII')
    expect(datos.empresa).toBeTruthy()
    expect(() => s.reportes.imprimir(s.sin('reportes.imprimir'), { reporte: 'VENTAS' }))
      .toThrow(/permiso/i)
    s.db.close()
  })
})

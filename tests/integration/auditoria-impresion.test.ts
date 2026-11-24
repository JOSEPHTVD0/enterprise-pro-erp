import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createComprasService } from '../../src/main/services/compras.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createReportesService } from '../../src/main/services/reportes.service'
import { createSeguridadService } from '../../src/main/services/seguridad.service'
import { createVentasService } from '../../src/main/services/ventas.service'
import type { SessionContext } from '@shared/session'
import { testDb } from '../helpers/db'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'F11-PC').context as SessionContext
  const maestros = createMaestrosService(db)
  const seguridad = createSeguridadService(db)
  const inventario = createInventarioService(db)
  const ventas = createVentasService(db, inventario)
  const compras = createComprasService(db, inventario)
  const finanzas = createFinanzasService(db)
  const reportes = createReportesService(db)
  const hoy = new Date().toISOString().slice(0, 10)

  const { id: clienteId } = maestros.save(ctx, 'clientes', {
    codigo: 'CLI-F11', nombre: 'Cliente Fase 11', tipo: 'EMPRESA',
    rncCedula: '101666666', activo: true
  }) as { id: number }
  const { id: proveedorId } = maestros.save(ctx, 'proveedores', {
    codigo: 'PRO-F11', nombreComercial: 'Proveedor Fase 11', razonSocial: 'Proveedor Fase 11 SRL',
    rnc: '102777777', activo: true
  }) as { id: number }
  const { id: productoId } = maestros.save(ctx, 'productos', {
    codigo: 'ART-F11', descripcion: 'Artículo Fase 11', tipo: 'FISICO',
    precio1Cent: 10000, costoPromedioCent: 6000, activo: true
  }) as { id: number }

  const ventaId = Number(db.prepare(`
    INSERT INTO documentos_venta (
      empresa_id, tipo, numero, es_ncf, cliente_id, cliente_nombre, cliente_rnc, fecha, estado,
      subtotal_cent, descuento_cent, impuesto_cent, total_cent, costo_total_cent
    ) VALUES (1, 'FACTURA_CREDITO', 'FCR-F11-1', 1, ?, ?, '101666666', ?, 'ACTIVO', 10000, 0, 1800, 11800, 6000)
  `).run(clienteId, 'Cliente Fase 11', hoy).lastInsertRowid)
  db.prepare(`
    INSERT INTO documento_venta_lineas (
      empresa_id, doc_id, producto_id, descripcion, cantidad, precio_cent,
      impuesto_cent, subtotal_cent, total_cent
    ) VALUES (1, ?, ?, 'Servicio F11', 1, 10000, 1800, 10000, 11800)
  `).run(ventaId, productoId)

  const compraId = Number(db.prepare(`
    INSERT INTO documentos_compra (
      empresa_id, tipo, numero, numero_proveedor, proveedor_id, proveedor_nombre, proveedor_rnc,
      fecha, estado, subtotal_cent, impuesto_cent, total_cent
    ) VALUES (1, 'FACTURA_COMPRA', 'FCO-F11-1', 'B0100000777', ?, ?, '102777777', ?, 'CONTABILIZADO', 5000, 900, 5900)
  `).run(proveedorId, 'Proveedor Fase 11', hoy).lastInsertRowid)
  db.prepare(`
    INSERT INTO documento_compra_lineas (
      empresa_id, doc_id, producto_id, descripcion, cantidad, precio_cent,
      impuesto_cent, subtotal_cent, total_cent
    ) VALUES (1, ?, ?, 'Artículo F11', 1, 5000, 900, 5000, 5900)
  `).run(compraId, productoId)

  const cxcId = Number(db.prepare(`
    INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FCR-F11-1', ?, '2027-12-31', 11800, 11800, 'PENDIENTE')
  `).run(clienteId, ventaId, hoy).lastInsertRowid)
  const cxpId = Number(db.prepare(`
    INSERT INTO cxp_documentos (empresa_id, proveedor_id, doc_compra_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent, estado)
    VALUES (1, ?, ?, 'FCO-F11-1', ?, '2027-12-31', 5900, 5900, 'PENDIENTE')
  `).run(proveedorId, compraId, hoy).lastInsertRowid)

  return { db, ctx, seguridad, ventas, compras, finanzas, reportes, ventaId, compraId, cxcId, cxpId, clienteId, hoy }
}

describe('Fase 11 — auditoría e impresión sobre datos reales', () => {
  it('filtra el historial de auditoría por entidad, operación, usuario y fecha', () => {
    const { db, ctx, seguridad, clienteId } = setup()
    const todos = seguridad.listAudit(ctx, {}) as Fila[]
    expect(todos.length).toBeGreaterThan(0)
    expect(todos.some((f) => f.entidad === 'clientes' && f.operacion === 'CREAR' && Number(f.entidad_id) === clienteId)).toBe(true)

    const clientes = seguridad.listAudit(ctx, { entidad: 'clientes' }) as Fila[]
    expect(clientes.length).toBeGreaterThan(0)
    expect(clientes.every((f) => f.entidad === 'clientes')).toBe(true)

    const crear = seguridad.listAudit(ctx, { operacion: 'CREAR' }) as Fila[]
    expect(crear.every((f) => String(f.operacion).includes('CREAR'))).toBe(true)

    const porUsuario = seguridad.listAudit(ctx, { usuarioId: ctx.userId }) as Fila[]
    expect(porUsuario.length).toBe(todos.length)

    const futuro = seguridad.listAudit(ctx, { fechaDesde: '2999-01-01' }) as Fila[]
    expect(futuro).toEqual([])
    const pasado = seguridad.listAudit(ctx, { fechaHasta: '2000-01-01' }) as Fila[]
    expect(pasado).toEqual([])

    expect(() => seguridad.listAudit({ ...ctx, permisos: [] }, {})).toThrowError(/permiso/i)
    db.close()
  })

  it('entrega datos de impresión de ventas y compras con cabecera y líneas reales', () => {
    const { db, ctx, ventas, compras, ventaId, compraId } = setup()
    const venta = ventas.datosImpresion(ctx, { id: ventaId, formato: 'TICKET_80' }) as Fila
    expect(venta.formato).toBe('TICKET_80')
    expect((venta.empresa as Fila).razonSocial).toBeTruthy()
    expect((venta.documento as Fila).numero).toBe('FCR-F11-1')
    expect((venta.lineas as Fila[]).length).toBe(1)

    const compra = compras.datosImpresion(ctx, { id: compraId, formato: 'MEDIA' }) as Fila
    expect(compra.formato).toBe('MEDIA')
    expect((compra.documento as Fila).numeroProveedor).toBe('B0100000777')
    expect((compra.lineas as Fila[]).length).toBe(1)

    const sinPermiso = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'compras.imprimir') }
    expect(() => compras.datosImpresion(sinPermiso, { id: compraId })).toThrowError(/permiso/i)
    db.close()
  })

  it('entrega datos de impresión de CxC y CxP con el discriminador correcto', () => {
    const { db, ctx, finanzas, cxcId, cxpId } = setup()
    const cxc = finanzas.cxcImprimir(ctx, { id: cxcId, formato: 'CARTA', tipo: 'DOCUMENTO' }) as Fila
    expect((cxc.documento as Fila).numeroDocumento).toBe('FCR-F11-1')
    expect(Array.isArray(cxc.lineas)).toBe(true)

    const cxp = finanzas.cxpImprimir(ctx, { id: cxpId, formato: 'CARTA', tipo: 'DOCUMENTO' }) as Fila
    expect((cxp.documento as Fila).numeroDocumento).toBe('FCO-F11-1')

    const sinPermiso = { ...ctx, permisos: ctx.permisos.filter((p) => p !== 'cxc.imprimir') }
    expect(() => finanzas.cxcImprimir(sinPermiso, { id: cxcId })).toThrowError(/permiso/i)
    db.close()
  })

  it('incluye el aviso DGII en los libros imprimibles y el CSS define @media print', () => {
    const { db, ctx, reportes } = setup()
    const libro = reportes.imprimir(ctx, { reporte: 'LIBRO607', filtro: { limite: 300 } }) as Fila
    expect(libro.titulo).toContain('607')
    expect(String(libro.aviso)).toContain('no constituye certificación DGII')
    expect((libro.empresa as Fila).nombre_comercial).toBeTruthy()

    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/index.css'), 'utf8')
    expect(css).toMatch(/@media\s+print/)
    db.close()
  })
})

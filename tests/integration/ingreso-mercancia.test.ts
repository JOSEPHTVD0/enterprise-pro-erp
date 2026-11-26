import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { createComprasService } from '../../src/main/services/compras.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>
const FECHA = '2026-01-15'

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'INGRESO-PC')
  const ctx = login.context as SessionContext
  const maestros = createMaestrosService(db)
  const inventario = createInventarioService(db)
  const ajustes = createAjustesService(db)
  const compras = createComprasService(db, inventario, ajustes)
  const finanzas = createFinanzasService(db, ajustes)

  const proveedorId = Number(db.prepare(`
    INSERT INTO proveedores (empresa_id, codigo, nombre_comercial, razon_social, rnc, condicion_pago_dias)
    VALUES (1, 'ING-PROV', 'Proveedor Ingreso', 'Proveedor Ingreso SRL', '101234567', 15)
  `).run().lastInsertRowid)

  const itbis18 = Number((db.prepare("SELECT id FROM impuestos WHERE codigo = 'ITBIS18'").get() as Fila).id)
  const exentoId = Number((db.prepare("SELECT id FROM impuestos WHERE codigo = 'EXENTO'").get() as Fila).id)
  db.prepare('INSERT OR IGNORE INTO impuestos (empresa_id, codigo, descripcion, tasa_bp, exento) VALUES (1, ?, ?, ?, 0)')
    .run('ITBIS12', 'ITBIS 12%', 1200)
  const itbis12 = Number((db.prepare("SELECT id FROM impuestos WHERE codigo = 'ITBIS12'").get() as Fila).id)

  const producto = (codigo: string, descripcion: string, impuestoId: number, extra: Record<string, unknown> = {}) =>
    Number((maestros.save(ctx, 'productos', {
      codigo, descripcion, tipo: 'FISICO', impuestoId,
      precio1Cent: 15000, precio2Cent: 0, precio3Cent: 0,
      precioMayoristaCent: 0, precioMinimoCent: 0,
      costoPromedioCent: 0, costoUltimaCompraCent: 0,
      existenciaMin: 0, existenciaMax: 0, manejaSerie: false, manejaLote: false,
      referencia: `REF-${codigo}`, activo: true, ...extra
    }) as { id: number }).id)

  const gravadoId = producto('ING-G', 'Producto gravado 18%', itbis18)
  const doceId = producto('ING-12', 'Producto gravado 12%', itbis12)
  const exentoProductoId = producto('ING-E', 'Producto exento', exentoId)

  const almacenSecundarioId = Number(db.prepare(`
    INSERT INTO almacenes (empresa_id, codigo, nombre, principal, activo)
    VALUES (1, 'ING-SEC', 'Almacén secundario', 0, 1)
  `).run().lastInsertRowid)

  db.prepare('INSERT OR IGNORE INTO monedas (empresa_id, codigo, nombre, simbolo, decimales, activa) VALUES (1, ?, ?, ?, 2, 1)')
    .run('USD', 'Dólar estadounidense', 'US$')
  db.prepare('INSERT OR IGNORE INTO tasas_cambio (empresa_id, moneda_codigo, tasa, fecha, usuario_id) VALUES (1, ?, ?, ?, ?)')
    .run('USD', 60, '2026-01-10', ctx.userId)
  const cuentaBancoId = Number(db.prepare(`
    INSERT INTO bancos_cuentas (empresa_id, codigo, nombre, banco, numero_cuenta, saldo_inicial_cent, saldo_cent)
    VALUES (1, 'ING-BANK', 'Cuenta ingreso', 'Banco Prueba', '0001', 100000, 100000)
  `).run().lastInsertRowid)

  const linea = (productoId: number, cantidad: number, extra: Record<string, unknown> = {}) => ({
    productoId, cantidad, precioCent: 10000, ...extra
  })
  const ingreso = (extra: Record<string, unknown> = {}) => compras.ingreso(ctx, {
    fecha: FECHA, proveedorId, lineas: [linea(gravadoId, 2)], ...extra
  }) as { id: number; numero: string; totalCent: number }

  const doc = (id: number) => db.prepare('SELECT * FROM documentos_compra WHERE id = ?').get(id) as Fila
  const existe = (productoId: number, almacenId = 1) => db.prepare(`
    SELECT cantidad, valor_cent FROM existencias WHERE producto_id = ? AND almacen_id = ?
  `).get(productoId, almacenId) as Fila | undefined
  const productoFila = (productoId: number) =>
    db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId) as Fila
  const balance = () => Number((db.prepare('SELECT balance_cent FROM proveedores WHERE id = ?').get(proveedorId) as Fila).balance_cent)
  const asientoDel = (id: number) => {
    const asientoId = Number(doc(id).asiento_id ?? 0)
    return asientoId
      ? db.prepare('SELECT * FROM asientos WHERE id = ?').get(asientoId) as Fila | undefined
      : undefined
  }

  return {
    db, ctx, compras, finanzas, proveedorId, itbis18, itbis12, exentoId,
    gravadoId, doceId, exentoProductoId, almacenSecundarioId, cuentaBancoId,
    linea, ingreso, doc, existe, productoFila, balance, asientoDel
  }
}

const sinPermiso = (ctx: SessionContext, clave: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((p) => p !== clave)
})

describe('Ingreso de mercancía — 14 casos reales', () => {
  it('1. contado: totaliza, mueve stock, registra pago y crea asiento COMPRA', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-001',
      pagos: [{ metodo: 'EFECTIVO', montoCent: 23600, referencia: 'PAGO-1' }]
    })
    expect(ingreso.totalCent).toBe(23600)
    expect(s.doc(ingreso.id)).toMatchObject({
      estado: 'CONTABILIZADO', condicion: 'CONTADO', numero_proveedor: 'FACT-001',
      subtotal_cent: 20000, impuesto_cent: 3600, total_cent: 23600,
      monto_factura_cent: 23600, diferencia_cent: 0, moneda_codigo: 'DOP', tasa_aplicada: 1
    })
    expect(s.db.prepare('SELECT * FROM pagos_compra WHERE doc_id = ?').all(ingreso.id)).toHaveLength(1)
    expect(s.db.prepare('SELECT * FROM cxp_documentos WHERE doc_compra_id = ?').all(ingreso.id)).toHaveLength(0)
    expect(s.existe(s.gravadoId)).toMatchObject({ cantidad: 2, valor_cent: 20000 })
    expect(s.productoFila(s.gravadoId)).toMatchObject({ costo_promedio_cent: 10000, costo_ultima_compra_cent: 10000 })
    expect(s.asientoDel(ingreso.id)).toMatchObject({ tipo: 'COMPRA', estado: 'BORRADOR' })
    expect(s.db.prepare(`
      SELECT COUNT(*) AS n FROM asiento_lineas WHERE asiento_id = ?
    `).get(Number(s.doc(ingreso.id).asiento_id))).toMatchObject({ n: 3 })
    s.db.close()
  })

  it('2. crédito: genera CxP real, cargo y asiento contra 2110 sin pagos', () => {
    const s = setup()
    const ingreso = s.ingreso({ credito: true, numeroProveedor: 'FACT-002' })
    const cxp = s.db.prepare('SELECT * FROM cxp_documentos WHERE doc_compra_id = ?').get(ingreso.id) as Fila
    expect(cxp).toMatchObject({ monto_cent: 23600, saldo_cent: 23600, estado: 'PENDIENTE' })
    expect(String(cxp.vencimiento)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.db.prepare("SELECT * FROM cxp_movimientos WHERE doc_compra_id = ? AND tipo = 'CARGO'").all(ingreso.id)).toHaveLength(1)
    expect(s.balance()).toBe(23600)
    expect(s.db.prepare('SELECT * FROM pagos_compra WHERE doc_id = ?').all(ingreso.id)).toHaveLength(0)
    const acreedora = s.db.prepare(`
      SELECT pc.codigo, al.haber_centavos FROM asiento_lineas al
      JOIN plan_cuentas pc ON pc.id = al.cuenta_id
      WHERE al.asiento_id = ? AND al.haber_centavos > 0
    `).get(Number(s.doc(ingreso.id).asiento_id)) as Fila
    expect(acreedora).toMatchObject({ codigo: '2110', haber_centavos: 23600 })
    s.db.close()
  })

  it('3. ITBIS mixto: desglosa cada tasa en documento_compra_impuestos', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-003',
      lineas: [s.linea(s.gravadoId, 1), s.linea(s.doceId, 1)]
    })
    expect(ingreso.totalCent).toBe(23000)
    const impuestos = s.db.prepare('SELECT * FROM documento_compra_impuestos WHERE doc_id = ? ORDER BY tasa_bp').all(ingreso.id) as Fila[]
    expect(impuestos).toHaveLength(2)
    expect(impuestos[0]).toMatchObject({ codigo: 'ITBIS12', tasa_bp: 1200, base_cent: 10000, impuesto_cent: 1200 })
    expect(impuestos[1]).toMatchObject({ codigo: 'ITBIS18', tasa_bp: 1800, base_cent: 10000, impuesto_cent: 1800 })
    s.db.close()
  })

  it('4. exentos: no generan impuesto y separan base exenta de gravada', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-004',
      lineas: [s.linea(s.exentoProductoId, 2), s.linea(s.gravadoId, 1)]
    })
    expect(s.doc(ingreso.id)).toMatchObject({
      exento_cent: 20000, gravado_cent: 10000, impuesto_cent: 1800,
      subtotal_cent: 30000, total_cent: 31800
    })
    const exento = s.db.prepare("SELECT * FROM documento_compra_impuestos WHERE doc_id = ? AND exento = 1").get(ingreso.id) as Fila
    expect(exento).toMatchObject({ codigo: 'EXENTO', tasa_bp: 0, impuesto_cent: 0, base_cent: 20000 })
    s.db.close()
  })

  it('5. descuentos 1, 2 y 3 secuenciales con permiso compras.descuento', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-005',
      lineas: [s.linea(s.gravadoId, 2, {
        descuentoPctBp: 1000, descuento2Cent: 500, descuento3PctBp: 500
      })]
    })
    expect(s.doc(ingreso.id)).toMatchObject({
      descuento1_cent: 2000, descuento2_cent: 500, descuento_items_cent: 875,
      base_cent: 16625, impuesto_cent: 2993, total_cent: 19618
    })
    expect(s.db.prepare('SELECT * FROM documento_compra_lineas WHERE doc_id = ?').get(ingreso.id))
      .toMatchObject({ descuento1_pct_bp: 1000, descuento2_cent: 500, descuento3_pct_bp: 500 })
    expect(() => s.compras.ingreso(sinPermiso(s.ctx, 'compras.descuento'), {
      fecha: FECHA, proveedorId: s.proveedorId, numeroProveedor: 'FACT-005B',
      lineas: [s.linea(s.gravadoId, 1, { descuentoPctBp: 100 })]
    })).toThrow(/permiso/i)
    s.db.close()
  })

  it('6. flete de cabecera se prorratea al costo sin gravarse dos veces', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-006', fleteCent: 1000,
      lineas: [s.linea(s.gravadoId, 1), s.linea(s.doceId, 1)]
    })
    expect(s.doc(ingreso.id)).toMatchObject({
      flete_cent: 1000, gasto_cent: 1000, impuesto_cent: 3000, total_cent: 24000
    })
    expect(s.existe(s.gravadoId)).toMatchObject({ cantidad: 1, valor_cent: 10500 })
    expect(s.existe(s.doceId)).toMatchObject({ cantidad: 1, valor_cent: 10500 })
    s.db.close()
  })

  it('7. moneda extranjera usa tasa vigente y exige permiso para fijar otra', () => {
    const s = setup()
    const sinTasa = sinPermiso(s.ctx, 'compras.tasa')
    const ingreso = s.compras.ingreso(sinTasa, {
      fecha: FECHA, proveedorId: s.proveedorId, numeroProveedor: 'FACT-007',
      monedaCodigo: 'USD', montoFacturaMonedaCent: 236,
      lineas: [s.linea(s.gravadoId, 2, { precioCent: 100 })]
    }) as { id: number; totalCent: number }
    expect(s.doc(ingreso.id)).toMatchObject({
      moneda_codigo: 'USD', tasa_aplicada: 60, monto_factura_moneda_cent: 236,
      base_cent: 12000, impuesto_cent: 2160, total_cent: 14160
    })
    expect(ingreso.totalCent).toBe(14160)
    expect(() => s.compras.ingreso(sinTasa, {
      fecha: FECHA, proveedorId: s.proveedorId, numeroProveedor: 'FACT-007B',
      monedaCodigo: 'USD', tasaAplicada: 61,
      lineas: [s.linea(s.gravadoId, 1, { precioCent: 100 })]
    })).toThrow(/permiso/i)
    s.db.close()
  })

  it('8. multiartículo: todas las líneas se persisten y generan movimiento propio', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-008',
      lineas: [s.linea(s.gravadoId, 1), s.linea(s.doceId, 2), s.linea(s.exentoProductoId, 3)]
    })
    const lineas = s.db.prepare('SELECT * FROM documento_compra_lineas WHERE doc_id = ?').all(ingreso.id) as Fila[]
    expect(lineas).toHaveLength(3)
    expect(s.db.prepare("SELECT * FROM movimientos_inventario WHERE doc_tipo = 'FACTURA_COMPRA' AND doc_id = ?").all(ingreso.id)).toHaveLength(3)
    expect(s.existe(s.gravadoId)).toMatchObject({ cantidad: 1 })
    expect(s.existe(s.doceId)).toMatchObject({ cantidad: 2 })
    expect(s.existe(s.exentoProductoId)).toMatchObject({ cantidad: 3 })
    expect(ingreso.totalCent).toBe(64200)
    s.db.close()
  })

  it('9. stock y costo promedio se recalculan con compras sucesivas', () => {
    const s = setup()
    s.ingreso({ numeroProveedor: 'FACT-009A', lineas: [s.linea(s.gravadoId, 2, { precioCent: 10000 })] })
    s.ingreso({ numeroProveedor: 'FACT-009B', lineas: [s.linea(s.gravadoId, 2, { precioCent: 12000 })] })
    expect(s.existe(s.gravadoId)).toMatchObject({ cantidad: 4, valor_cent: 44000 })
    expect(s.productoFila(s.gravadoId)).toMatchObject({
      costo_promedio_cent: 11000, costo_ultima_compra_cent: 12000
    })
    expect(s.db.prepare("SELECT COUNT(*) AS n FROM movimientos_inventario WHERE doc_tipo = 'FACTURA_COMPRA'").get()).toMatchObject({ n: 2 })
    s.db.close()
  })

  it('10. CxP admite abono real y reduce el saldo del proveedor', () => {
    const s = setup()
    const ingreso = s.ingreso({ credito: true, numeroProveedor: 'FACT-010' })
    const cxp = s.db.prepare('SELECT * FROM cxp_documentos WHERE doc_compra_id = ?').get(ingreso.id) as Fila
    s.finanzas.cxpPagoCrear(s.ctx, {
      proveedorId: s.proveedorId, fecha: FECHA, montoCent: 10000,
      metodo: 'TRANSFERENCIA', referencia: 'ABONO-10', bancoCuentaId: s.cuentaBancoId,
      aplicaciones: [{ cxpDocumentoId: Number(cxp.id), montoCent: 10000 }],
      comentarios: 'Abono a compra'
    })
    expect(s.db.prepare('SELECT saldo_cent, estado FROM cxp_documentos WHERE id = ?').get(cxp.id))
      .toMatchObject({ saldo_cent: 13600, estado: 'PENDIENTE' })
    expect(s.balance()).toBe(13600)
    s.db.close()
  })

  it('11. anulación revierte stock, CxP y asiento, y deja versión auditorizada', () => {
    const s = setup()
    const ingreso = s.ingreso({ credito: true, numeroProveedor: 'FACT-011' })
    const asientoId = Number(s.doc(ingreso.id).asiento_id)
    s.compras.anular(s.ctx, { id: ingreso.id, motivo: 'Factura duplicada' })
    expect(s.existe(s.gravadoId) ?? { cantidad: 0 }).toMatchObject({ cantidad: 0 })
    expect(s.db.prepare('SELECT saldo_cent, estado FROM cxp_documentos WHERE doc_compra_id = ?').get(ingreso.id))
      .toMatchObject({ saldo_cent: 0, estado: 'ANULADO' })
    expect(s.db.prepare('SELECT estado FROM asientos WHERE id = ?').get(asientoId)).toMatchObject({ estado: 'ANULADO' })
    expect(s.doc(ingreso.id)).toMatchObject({ estado: 'ANULADO', asiento_id: null })
    const versiones = s.db.prepare("SELECT operacion FROM compra_versiones WHERE doc_id = ?").all(ingreso.id) as Fila[]
    expect(versiones.map((v) => v.operacion)).toEqual(expect.arrayContaining(['CREAR', 'ANULAR']))
    expect(s.db.prepare("SELECT id FROM documentos_compra WHERE doc_origen_id = ? AND tipo = 'DEVOLUCION_COMPRA'").all(ingreso.id)).toHaveLength(1)
    s.db.close()
  })

  it('12. edición corrige cantidades, almacén, CxP y asiento dentro de una transacción', () => {
    const s = setup()
    const ingreso = s.ingreso({
      numeroProveedor: 'FACT-012',
      pagos: [{ metodo: 'EFECTIVO', montoCent: 23600, referencia: '' }]
    })
    const asientoAnterior = Number(s.doc(ingreso.id).asiento_id)
    s.compras.editarIngreso(s.ctx, {
      id: ingreso.id, motivo: 'Corrección de cantidad y almacén',
      proveedorId: s.proveedorId, almacenId: s.almacenSecundarioId,
      numeroProveedor: 'FACT-012',
      lineas: [s.linea(s.gravadoId, 3)]
    })
    expect(s.doc(ingreso.id)).toMatchObject({
      total_cent: 35400, almacen_id: s.almacenSecundarioId, estado: 'CONTABILIZADO'
    })
    expect(s.existe(s.gravadoId) ?? { cantidad: 0 }).toMatchObject({ cantidad: 0 })
    expect(s.existe(s.gravadoId, s.almacenSecundarioId)).toMatchObject({ cantidad: 3, valor_cent: 30000 })
    expect(s.db.prepare('SELECT * FROM pagos_compra WHERE doc_id = ?').all(ingreso.id))
      .toMatchObject([{ monto_cent: 35400 }])
    expect(s.db.prepare('SELECT estado FROM asientos WHERE id = ?').get(asientoAnterior)).toMatchObject({ estado: 'ANULADO' })
    expect(s.asientoDel(ingreso.id)).toMatchObject({ tipo: 'COMPRA', estado: 'BORRADOR' })
    const versiones = s.db.prepare('SELECT operacion FROM compra_versiones WHERE doc_id = ?').all(ingreso.id) as Fila[]
    expect(versiones.map((v) => v.operacion)).toEqual(expect.arrayContaining(['CREAR', 'MODIFICAR']))
    s.db.close()
  })

  it('13. historial e impresión registran versiones, reimpresión, auditoría y asiento', () => {
    const s = setup()
    const ingreso = s.ingreso({ numeroProveedor: 'FACT-013' })
    const datos = s.compras.datosImpresion(s.ctx, { id: ingreso.id, formato: 'CARTA', motivo: 'Entrega al proveedor' }) as {
      documento: Fila; lineas: Fila[]; impuestos: Fila[]
    }
    expect(datos.documento.numero).toBe(ingreso.numero)
    expect(datos.lineas).toHaveLength(1)
    expect(datos.impuestos).toHaveLength(1)
    expect(s.db.prepare('SELECT * FROM compra_reimpresiones WHERE doc_id = ?').all(ingreso.id))
      .toMatchObject([{ formato: 'CARTA', motivo: 'Entrega al proveedor' }])

    const historial = s.compras.historial(s.ctx, { tipo: 'FACTURA_COMPRA', texto: 'FACT-013' }) as {
      documentos: Fila[]; versiones: Fila[]; reimpresiones: Fila[]
      auditoria: Fila[]; asientos: Fila[]
    }
    expect(historial.documentos.map((d) => Number(d.id))).toContain(ingreso.id)
    expect(historial.versiones.map((v) => v.operacion)).toEqual(expect.arrayContaining(['CREAR', 'IMPRIMIR']))
    expect(historial.reimpresiones).toHaveLength(1)
    expect(historial.auditoria.length).toBeGreaterThan(0)
    expect(historial.asientos.map((a) => Number(a.id))).toContain(Number(s.doc(ingreso.id).asiento_id))
    s.db.close()
  })

  it('14. permisos individuales se verifican en el servicio, no solo en la interfaz', () => {
    const s = setup()
    expect(ctxTiene(s.ctx, 'compras.descuento')).toBe(true)
    expect(ctxTiene(s.ctx, 'compras.tasa')).toBe(true)
    expect(ctxTiene(s.ctx, 'compras.almacen')).toBe(true)
    expect(ctxTiene(s.ctx, 'compras.historial')).toBe(true)

    const catalogos = s.compras.catalogos(s.ctx) as { productos: Fila[] }
    expect(catalogos.productos.find((p) => Number(p.id) === s.gravadoId)).toMatchObject({
      referencia: 'REF-ING-G', precio1Cent: 15000
    })

    expect(() => s.compras.ingreso(sinPermiso(s.ctx, 'compras.crear'), {
      fecha: FECHA, proveedorId: s.proveedorId, lineas: [s.linea(s.gravadoId, 1)]
    })).toThrow(/permiso/i)

    expect(() => s.compras.ingreso(sinPermiso(s.ctx, 'compras.almacen'), {
      fecha: FECHA, proveedorId: s.proveedorId, almacenId: s.almacenSecundarioId,
      numeroProveedor: 'FACT-014', lineas: [s.linea(s.gravadoId, 1)]
    })).toThrow(/permiso/i)

    expect(() => s.compras.historial(sinPermiso(s.ctx, 'compras.historial'))).toThrow(/permiso/i)

    const ingreso = s.ingreso({ numeroProveedor: 'FACT-014B' })
    expect(() => s.compras.datosImpresion(sinPermiso(s.ctx, 'compras.imprimir'), { id: ingreso.id })).toThrow(/permiso/i)
    expect(() => s.compras.editarIngreso(sinPermiso(s.ctx, 'compras.modificar'), {
      id: ingreso.id, motivo: 'Cambio no autorizado', proveedorId: s.proveedorId,
      lineas: [s.linea(s.gravadoId, 1)]
    })).toThrow(/permiso/i)

    const sinCosto = s.compras.detalle(sinPermiso(s.ctx, 'compras.costo'), ingreso.id) as {
      cabecera: Fila; lineas: Fila[]
    }
    expect(sinCosto.cabecera.costoTotalCent).toBeUndefined()
    expect(sinCosto.lineas[0].costoUnitCent).toBeUndefined()
    s.db.close()
  })
})

function ctxTiene(ctx: SessionContext, permiso: string): boolean {
  return ctx.permisos.includes(permiso)
}

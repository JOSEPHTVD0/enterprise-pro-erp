import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { createComprasService } from '../../src/main/services/compras.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { defaultAjustes } from '@shared/schemas/ajustes'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC')
  const ctx = login.context as SessionContext
  const maestros = createMaestrosService(db)
  const inventario = createInventarioService(db)
  const ajustes = createAjustesService(db)
  const compras = createComprasService(db, inventario, ajustes)

  const proveedorId = Number(db.prepare(`
    INSERT INTO proveedores (empresa_id, codigo, nombre_comercial, razon_social, rnc, condicion_pago_dias)
    VALUES (1, 'PRO-TEST', 'Proveedor Prueba', 'Proveedor Prueba SRL', '101234567', 15)
  `).run().lastInsertRowid)

  const impuestoId = Number((db.prepare("SELECT id FROM impuestos WHERE codigo = 'ITBIS18'").get() as Fila).id)
  const productoId = (maestros.save(ctx, 'productos', {
    codigo: 'PRO-COMPRA', descripcion: 'Producto de compra', tipo: 'FISICO',
    precio1Cent: 15000, costoPromedioCent: 0, costoUltimaCompraCent: 0,
    precio2Cent: 0, precio3Cent: 0, precioMayoristaCent: 0, precioMinimoCent: 0,
    existenciaMin: 0, existenciaMax: 0, manejaSerie: false, manejaLote: false,
    impuestoId, activo: true
  }) as { id: number }).id

  const linea = (cantidad: number, extra: Record<string, unknown> = {}) => ({
    productoId, cantidad, precioCent: 10000, ...extra
  })
  const facturaDirecta = (credito = false) => compras.factura(ctx, {
    tipo: 'FACTURA_COMPRA', proveedorId, lineas: [linea(2)], credito
  }) as { id: number; numero: string; totalCent: number }

  const existencia = () => db.prepare(`
    SELECT cantidad, valor_cent FROM existencias WHERE producto_id = ? AND almacen_id = 1
  `).get(productoId) as Fila
  const producto = () => db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId) as Fila
  const balance = () => Number((db.prepare('SELECT balance_cent FROM proveedores WHERE id = ?').get(proveedorId) as Fila).balance_cent)
  const comprasKardex = () => db.prepare(`
    SELECT COUNT(*) AS n FROM movimientos_inventario
    WHERE empresa_id = 1 AND producto_id = ? AND doc_tipo <> 'DEVOLUCION_COMPRA'
  `).get(productoId) as Fila

  return {
    db, ctx, maestros, inventario, ajustes, compras, proveedorId, productoId,
    linea, facturaDirecta, existencia, producto, balance, comprasKardex
  }
}

const sinPermiso = (ctx: SessionContext, clave: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((p) => p !== clave)
})

function guardarFlujos(
  ajustes: ReturnType<typeof createAjustesService>,
  ctx: SessionContext,
  cambios: Partial<typeof defaultAjustes.flujos>
): void {
  ajustes.save(ctx, { grupo: 'flujos', datos: { ...defaultAjustes.flujos, ...cambios } })
}

describe('Fase 7 — compras, recepciones, CxP y devoluciones', () => {
  it('la migración 005 crea los libros de compras y las series internas', () => {
    const { db } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    for (const t of [
      'documentos_compra', 'documento_compra_lineas', 'pagos_compra',
      'cxp_documentos', 'cxp_movimientos'
    ]) expect(tablas).toContain(t)
    const series = (db.prepare('SELECT tipo_doc FROM series_documento WHERE empresa_id = 1').all() as Fila[])
      .map((s) => s.tipo_doc)
    for (const tipo of ['SOLICITUD_COMPRA', 'ORDEN_COMPRA', 'RECEPCION', 'FACTURA_COMPRA', 'DEVOLUCION_COMPRA']) {
      expect(series).toContain(tipo)
    }
    db.close()
  })

  it('la factura de contado numera, calcula ITBIS, mueve kardex y deja auditoría', () => {
    const { db, ctx, facturaDirecta, existencia, producto, comprasKardex, productoId } = setup()
    const doc = facturaDirecta()
    expect(doc.numero).toMatch(/^FCO-0000000\d$/)
    expect(doc.totalCent).toBe(23600)

    const fila = db.prepare('SELECT * FROM documentos_compra WHERE id = ?').get(doc.id) as Fila
    expect(fila).toMatchObject({
      tipo: 'FACTURA_COMPRA', estado: 'CONTABILIZADO', condicion: 'CONTADO',
      subtotal_cent: 20000, impuesto_cent: 3600, total_cent: 23600, costo_total_cent: 20000
    })
    expect(existencia()).toMatchObject({ cantidad: 2, valor_cent: 20000 })
    expect(producto()).toMatchObject({ costo_promedio_cent: 10000, costo_ultima_compra_cent: 10000 })

    const mov = db.prepare("SELECT * FROM movimientos_inventario WHERE doc_tipo = 'FACTURA_COMPRA' AND doc_id = ?").get(doc.id) as Fila
    expect(mov).toMatchObject({ tipo: 'COMPRA', cantidad: 2, costo_unit_cent: 10000, producto_id: productoId })
    expect(mov.doc_linea_id).toBeTruthy()
    expect(comprasKardex().n).toBe(1)

    const pagos = db.prepare('SELECT * FROM pagos_compra WHERE doc_id = ?').all(doc.id) as Fila[]
    expect(pagos).toHaveLength(1)
    expect(pagos[0]).toMatchObject({ metodo: 'EFECTIVO', monto_cent: 23600 })
    expect(db.prepare('SELECT * FROM cxp_documentos WHERE doc_compra_id = ?').all(doc.id)).toHaveLength(0)

    const audit = db.prepare("SELECT operacion FROM auditoria WHERE entidad = 'documentos_compra' AND entidad_id = ?").all(String(doc.id)) as Fila[]
    expect(audit.map((a) => a.operacion)).toEqual(['CREAR'])
    void ctx
    db.close()
  })

  it('la factura a crédito crea CxP real y nunca un pago automático', () => {
    const { db, facturaDirecta, balance } = setup()
    const doc = facturaDirecta(true)
    const cxp = db.prepare('SELECT * FROM cxp_documentos WHERE doc_compra_id = ?').get(doc.id) as Fila
    expect(cxp).toMatchObject({ monto_cent: 23600, saldo_cent: 23600, estado: 'PENDIENTE' })
    expect(String(cxp.vencimiento)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const mov = db.prepare("SELECT * FROM cxp_movimientos WHERE doc_compra_id = ? AND tipo = 'CARGO'").get(doc.id) as Fila
    expect(mov.monto_cent).toBe(23600)
    expect(balance()).toBe(23600)
    expect(db.prepare('SELECT * FROM pagos_compra WHERE doc_id = ?').all(doc.id)).toHaveLength(0)
    db.close()
  })

  it('la anulación de factura directa revierte stock, genera devolución y cancela la CxP', () => {
    const { db, ctx, compras, facturaDirecta, existencia, balance } = setup()
    const doc = facturaDirecta(true)
    const resultado = compras.anular(ctx, { id: doc.id, motivo: 'Factura incorrecta' }) as { id: number; devolucionId: number }
    expect(resultado.devolucionId).toBeTruthy()
    expect(existencia()).toMatchObject({ cantidad: 0, valor_cent: 0 })
    expect(balance()).toBe(0)

    const dev = db.prepare('SELECT * FROM documentos_compra WHERE id = ?').get(resultado.devolucionId) as Fila
    expect(dev).toMatchObject({ tipo: 'DEVOLUCION_COMPRA', doc_origen_id: doc.id, estado: 'CONTABILIZADO' })
    const kardex = db.prepare("SELECT * FROM movimientos_inventario WHERE doc_tipo = 'DEVOLUCION_COMPRA' AND doc_id = ?").get(resultado.devolucionId) as Fila
    expect(kardex).toMatchObject({ tipo: 'DEV_COMPRA', cantidad: -2, costo_unit_cent: 10000 })
    expect((db.prepare('SELECT estado, saldo_cent FROM cxp_documentos WHERE doc_compra_id = ?').get(doc.id) as Fila))
      .toMatchObject({ estado: 'ANULADO', saldo_cent: 0 })
    expect((db.prepare('SELECT estado FROM documentos_compra WHERE id = ?').get(doc.id) as Fila).estado).toBe('ANULADO')
    db.close()
  })

  it('solicitud → orden → recepción parcial → factura mueve el stock una sola vez', () => {
    const { db, ctx, compras, proveedorId, productoId, linea, existencia, comprasKardex } = setup()
    const solicitud = compras.solicitud(ctx, {
      tipo: 'SOLICITUD_COMPRA', proveedorId, lineas: [linea(10)]
    }) as { id: number }
    const orden = compras.convertir(ctx, { id: solicitud.id, tipoDestino: 'ORDEN_COMPRA' }) as { id: number }
    const ordenLinea = (db.prepare('SELECT * FROM documento_compra_lineas WHERE doc_id = ?').get(orden.id) as Fila)

    const recepcion = compras.registrarRecepcion(ctx, {
      ordenId: orden.id, lineas: [{ docLineaId: Number(ordenLinea.id), cantidad: 4 }]
    }) as { id: number; completo: boolean }
    expect(recepcion.completo).toBe(false)
    expect(existencia()).toMatchObject({ cantidad: 4, valor_cent: 40000 })
    expect(comprasKardex().n).toBe(1)
    expect((db.prepare('SELECT cantidad_recibida FROM documento_compra_lineas WHERE id = ?').get(ordenLinea.id) as Fila).cantidad_recibida).toBe(4)
    expect((db.prepare('SELECT estado FROM documentos_compra WHERE id = ?').get(orden.id) as Fila).estado).toBe('PARCIAL')

    expect(() => compras.registrarRecepcion(ctx, {
      ordenId: orden.id, lineas: [{ docLineaId: Number(ordenLinea.id), cantidad: 7 }]
    })).toThrow(/excede el pendiente/i)

    const factura = compras.convertir(ctx, {
      id: recepcion.id, tipoDestino: 'FACTURA_COMPRA', credito: true
    }) as { id: number; totalCent: number }
    expect(factura.totalCent).toBe(47200)
    expect(comprasKardex().n).toBe(1)
    expect((db.prepare('SELECT estado FROM documentos_compra WHERE id = ?').get(recepcion.id) as Fila).estado).toBe('CONVERTIDA')

    const facturaLinea = db.prepare('SELECT * FROM documento_compra_lineas WHERE doc_id = ?').get(factura.id) as Fila
    expect(() => compras.devolucion(ctx, {
      tipo: 'DEVOLUCION_COMPRA', proveedorId, docOrigenId: factura.id,
      lineas: [{ productoId, docLineaId: Number(facturaLinea.id), cantidad: 4 }],
      motivo: 'Devolución inválida'
    })).toThrow(/recepción/i)

    const resultado = compras.anular(ctx, { id: factura.id, motivo: 'Corregir factura' }) as { devolucionId: number | null }
    expect(resultado.devolucionId).toBeNull()
    expect(comprasKardex().n).toBe(1)
    expect((db.prepare('SELECT estado FROM documentos_compra WHERE id = ?').get(recepcion.id) as Fila).estado).toBe('COMPLETO')
    expect((db.prepare('SELECT saldo_cent FROM cxp_documentos WHERE doc_compra_id = ?').get(factura.id) as Fila).saldo_cent).toBe(0)

    const recepcionLinea = db.prepare('SELECT * FROM documento_compra_lineas WHERE doc_id = ?').get(recepcion.id) as Fila
    const devolucion = compras.devolucion(ctx, {
      tipo: 'DEVOLUCION_COMPRA', proveedorId, docOrigenId: recepcion.id,
      lineas: [{ productoId, docLineaId: Number(recepcionLinea.id), cantidad: 4 }],
      motivo: 'Mercancía dañada'
    }) as { id: number }
    expect(devolucion.id).toBeTruthy()
    expect(existencia()).toMatchObject({ cantidad: 0, valor_cent: 0 })
    expect((db.prepare('SELECT cantidad_devuelta FROM documento_compra_lineas WHERE id = ?').get(recepcionLinea.id) as Fila).cantidad_devuelta).toBe(4)
    expect(() => compras.devolucion(ctx, {
      tipo: 'DEVOLUCION_COMPRA', proveedorId, docOrigenId: recepcion.id,
      lineas: [{ productoId, docLineaId: Number(recepcionLinea.id), cantidad: 1 }],
      motivo: 'Duplicada'
    })).toThrow(/excede el pendiente/i)
    void productoId
    db.close()
  })

  it('los permisos y la visibilidad de costo se verifican en el servicio', () => {
    const { db, ctx, compras, facturaDirecta, proveedorId, linea } = setup()
    const doc = facturaDirecta()
    expect(() => compras.documentos(sinPermiso(ctx, 'compras.consultar'), {})).toThrow(/permiso/i)
    expect(() => compras.factura(sinPermiso(ctx, 'compras.crear'), {
      tipo: 'FACTURA_COMPRA', proveedorId, lineas: [linea(1)]
    })).toThrow(/permiso/i)

    const sinCosto = compras.detalle(sinPermiso(ctx, 'compras.costo'), doc.id) as {
      cabecera: Fila; lineas: Fila[]
    }
    expect(sinCosto.cabecera.costoTotalCent).toBeUndefined()
    expect(sinCosto.lineas[0].costoUnitCent).toBeUndefined()
    const completo = compras.detalle(ctx, doc.id) as { cabecera: Fila; lineas: Fila[] }
    expect(completo.cabecera.costoTotalCent).toBe(20000)
    expect(completo.lineas[0].costoUnitCent).toBe(10000)
    db.close()
  })

  it('los gastos asociados se capitalizan al costo y se adeudan sin gravarse dos veces', () => {
    const { db, ctx, compras, proveedorId, linea, existencia, producto } = setup()
    const doc = compras.factura(ctx, {
      tipo: 'FACTURA_COMPRA', proveedorId, credito: true,
      lineas: [linea(2, { gastoCent: 1000 })]
    }) as { id: number; totalCent: number }
    expect(doc.totalCent).toBe(24600)
    expect((db.prepare('SELECT impuesto_cent, gasto_cent FROM documentos_compra WHERE id = ?').get(doc.id) as Fila))
      .toMatchObject({ impuesto_cent: 3600, gasto_cent: 1000 })
    expect(existencia()).toMatchObject({ cantidad: 2, valor_cent: 21000 })
    expect(producto()).toMatchObject({ costo_promedio_cent: 10500, costo_ultima_compra_cent: 10500 })
    expect((db.prepare('SELECT saldo_cent FROM cxp_documentos WHERE doc_compra_id = ?').get(doc.id) as Fila).saldo_cent).toBe(24600)
    db.close()
  })
})

describe('Ajustes administrativos — flujos de compras', () => {
  it('exige compras.aprobar en la factura sin umbral y lo audita sin cambiar estado ni stock', () => {
    const { db, ctx, ajustes, compras, proveedorId, linea, existencia } = setup()
    guardarFlujos(ajustes, ctx, { comprasRequierenAprobacion: true })
    const sinAprobar = sinPermiso(ctx, 'compras.aprobar')

    expect(() => compras.factura(sinAprobar, {
      tipo: 'FACTURA_COMPRA', proveedorId, lineas: [linea(2)]
    })).toThrow(/permiso/i)
    expect(db.prepare("SELECT COUNT(*) AS n FROM documentos_compra WHERE tipo = 'FACTURA_COMPRA'").get()).toMatchObject({ n: 0 })
    expect(existencia() ?? { cantidad: 0, valor_cent: 0 }).toMatchObject({ cantidad: 0, valor_cent: 0 })

    const doc = compras.factura(ctx, {
      tipo: 'FACTURA_COMPRA', proveedorId, lineas: [linea(2)]
    }) as { id: number; totalCent: number }
    expect(doc.totalCent).toBe(23600)
    expect((db.prepare('SELECT estado FROM documentos_compra WHERE id = ?').get(doc.id) as Fila).estado).toBe('CONTABILIZADO')
    expect(existencia()).toMatchObject({ cantidad: 2, valor_cent: 20000 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM pagos_compra WHERE doc_id = ?').get(doc.id)).toMatchObject({ n: 1 })

    const autorizacion = db.prepare("SELECT * FROM auditoria WHERE entidad = 'flujos_aprobacion'").get() as Fila
    expect(autorizacion.entidad_id).toBe(String(doc.id))
    expect(JSON.parse(String(autorizacion.valores_despues))).toMatchObject({
      tipo: 'FACTURA_COMPRA', totalCent: 23600, umbralCent: 0, via: 'PERMISO', permiso: 'compras.aprobar'
    })
    db.close()
  })

  it('autoaprueba por umbral en centavos y exige permiso por encima del umbral', () => {
    const { db, ctx, ajustes, compras, proveedorId, linea } = setup()
    guardarFlujos(ajustes, ctx, { comprasRequierenAprobacion: true, autoAprobarHastaCent: 25000 })
    const sinAprobar = sinPermiso(ctx, 'compras.aprobar')

    const doc = compras.factura(sinAprobar, {
      tipo: 'FACTURA_COMPRA', proveedorId, lineas: [linea(2)], credito: true
    }) as { id: number; totalCent: number }
    expect(doc.totalCent).toBe(23600)
    expect(db.prepare('SELECT saldo_cent FROM cxp_documentos WHERE doc_compra_id = ?').get(doc.id)).toMatchObject({ saldo_cent: 23600 })
    expect(() => compras.factura(sinAprobar, {
      tipo: 'FACTURA_COMPRA', proveedorId, lineas: [linea(3)], credito: true
    })).toThrow(/permiso/i)
    expect(db.prepare("SELECT COUNT(*) AS n FROM documentos_compra WHERE tipo = 'FACTURA_COMPRA'").get()).toMatchObject({ n: 1 })

    const autorizaciones = db.prepare("SELECT valores_despues FROM auditoria WHERE entidad = 'flujos_aprobacion'").all() as Fila[]
    expect(autorizaciones).toHaveLength(1)
    expect(JSON.parse(String(autorizaciones[0].valores_despues))).toMatchObject({
      via: 'UMBRAL', totalCent: 23600, umbralCent: 25000, permiso: null
    })
    db.close()
  })

  it('solicitud, orden y recepción siguen sin requerir aprobación', () => {
    const { db, ctx, ajustes, compras, proveedorId, linea } = setup()
    guardarFlujos(ajustes, ctx, { comprasRequierenAprobacion: true })
    const sinAprobar = sinPermiso(ctx, 'compras.aprobar')

    const solicitud = compras.solicitud(sinAprobar, {
      tipo: 'SOLICITUD_COMPRA', proveedorId, lineas: [linea(10)]
    }) as { id: number }
    const orden = compras.convertir(sinAprobar, { id: solicitud.id, tipoDestino: 'ORDEN_COMPRA' }) as { id: number }
    const ordenLinea = db.prepare('SELECT id FROM documento_compra_lineas WHERE doc_id = ?').get(orden.id) as Fila
    compras.registrarRecepcion(sinAprobar, {
      ordenId: orden.id, lineas: [{ docLineaId: Number(ordenLinea.id), cantidad: 4 }]
    })
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad = 'flujos_aprobacion'").get()).toMatchObject({ n: 0 })
    db.close()
  })

  it('anulación exige motivo de al menos 3 caracteres solo cuando el ajuste está activo', () => {
    const { db, ctx, ajustes, compras, facturaDirecta } = setup()
    const doc = facturaDirecta(true)

    guardarFlujos(ajustes, ctx, { comprasRequierenAprobacion: false, anulacionRequiereMotivo: true })
    expect(() => compras.anular(ctx, { id: doc.id, motivo: 'ab' })).toThrow(/3 caracteres/i)
    expect(() => compras.anular(ctx, { id: doc.id, motivo: '' })).toThrow(/motivo/i)
    expect((db.prepare('SELECT estado FROM documentos_compra WHERE id = ?').get(doc.id) as Fila).estado).toBe('CONTABILIZADO')

    guardarFlujos(ajustes, ctx, { anulacionRequiereMotivo: false })
    expect(compras.anular(ctx, { id: doc.id, motivo: '' })).toMatchObject({ id: doc.id })
    const audit = db.prepare("SELECT valores_despues FROM auditoria WHERE operacion = 'ANULAR' AND entidad = 'documentos_compra' AND entidad_id = ?").get(String(doc.id)) as Fila
    expect(JSON.parse(String(audit.valores_despues)).motivo).toBe('Anulación solicitada')
    db.close()
  })
})

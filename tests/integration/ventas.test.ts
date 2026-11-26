import { describe, it, expect } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD, seedCompany } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createMaestrosService } from '../../src/main/services/maestros.service'
import { createInventarioService } from '../../src/main/services/inventario.service'
import { createVentasService } from '../../src/main/services/ventas.service'
import { createPosService } from '../../src/main/services/pos.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { defaultAjustes } from '@shared/schemas/ajustes'
import { DomainError } from '@shared/errors'
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
  const ventas = createVentasService(db, inventario, ajustes)
  const pos = createPosService(db, ventas)

  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre, rnc_cedula, condicion_pago_dias, limite_credito_cent)
    VALUES (1, 'CLI-TEST', 'Cliente Prueba', '123456789', 15, 1000000)
  `).run().lastInsertRowid)

  const productoId = (maestros.save(ctx, 'productos', {
    codigo: 'PRO-VENTA', descripcion: 'Producto de venta', tipo: 'FISICO',
    precio1Cent: 20000, costoPromedioCent: 10000, costoUltimaCompraCent: 0,
    precio2Cent: 0, precio3Cent: 0, precioMayoristaCent: 0, precioMinimoCent: 0,
    existenciaMin: 0, existenciaMax: 0, manejaSerie: false, manejaLote: false, activo: true
  }) as { id: number }).id

  inventario.movimiento(ctx, {
    productoId, almacenId: 1, tipo: 'COMPRA', cantidad: 100,
    costoUnitCent: 10000, motivo: 'Alta inicial', referencia: ''
  })

  const linea = (cantidad = 2, extra: Record<string, unknown> = {}) => ({ productoId, cantidad, ...extra })
  const existencia = () => (db.prepare('SELECT cantidad, valor_cent FROM existencias WHERE producto_id = ?').get(productoId) as Fila)
  const factura = (tipo = 'FACTURA_CONTADO', lineas = [linea()]) =>
    ventas.factura(ctx, { tipo: tipo as 'FACTURA_CONTADO', clienteId, lineas }) as {
      id: number; numero: string; totalCent: number; esNcf: boolean
    }

  return { db, ctx, maestros, inventario, ajustes, ventas, pos, clienteId, productoId, linea, existencia, factura }
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

describe('Fase 6 — ventas, POS y documentos', () => {
  it('la migración 004 crea los libros de ventas, caja y CxC', () => {
    const { db } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    for (const t of [
      'documentos_venta', 'documento_venta_lineas', 'caja_sesiones', 'caja_movimientos',
      'documento_pagos', 'cxc_documentos', 'cxc_movimientos', 'conduces',
      'conduce_lineas', 'ventas_suspendidas'
    ]) expect(tablas).toContain(t)
    db.close()
  })

  it('factura de contado numera, calcula ITBIS, descuenta stock y deja auditoría', () => {
    const { db, ctx, factura, existencia, productoId } = setup()
    const doc = factura()
    expect(doc.numero).toMatch(/^FAC-0000000\d$/)
    expect(doc.esNcf).toBe(false)
    expect(doc.totalCent).toBe(47200)

    const fila = db.prepare('SELECT * FROM documentos_venta WHERE id = ?').get(doc.id) as Fila
    expect(fila).toMatchObject({ tipo: 'FACTURA_CONTADO', estado: 'ACTIVO', subtotal_cent: 40000, impuesto_cent: 7200, total_cent: 47200 })
    expect(existencia()).toMatchObject({ cantidad: 98, valor_cent: 980000 })

    const mov = db.prepare("SELECT * FROM movimientos_inventario WHERE doc_tipo = 'FACTURA_CONTADO' AND doc_id = ?").get(doc.id) as Fila
    expect(mov).toMatchObject({ tipo: 'VENTA', cantidad: -2, costo_unit_cent: 10000, producto_id: productoId })
    expect(mov.doc_linea_id).toBeTruthy()

    // Ventas documenta; el cobro vive en Cobros. La factura queda como cargo CxC.
    expect(db.prepare('SELECT * FROM documento_pagos WHERE doc_id = ?').all(doc.id)).toHaveLength(0)
    const cxc = db.prepare('SELECT * FROM cxc_documentos WHERE doc_venta_id = ?').get(doc.id) as Fila
    expect(cxc).toMatchObject({ monto_cent: 47200, saldo_cent: 47200, estado: 'PENDIENTE' })

    const audit = db.prepare("SELECT operacion FROM auditoria WHERE entidad = 'documentos_venta' AND entidad_id = ?").all(String(doc.id)) as Fila[]
    expect(audit.map((a) => a.operacion)).toEqual(['CREAR'])
    void ctx
    db.close()
  })

  it('factura a crédito crea cargo CxC real y nunca un cobro automático', () => {
    const { db, clienteId, factura } = setup()
    const doc = factura('FACTURA_CREDITO')
    const cxc = db.prepare('SELECT * FROM cxc_documentos WHERE doc_venta_id = ?').get(doc.id) as Fila
    expect(cxc).toMatchObject({ monto_cent: 47200, saldo_cent: 47200, estado: 'PENDIENTE' })
    expect(String(cxc.vencimiento)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const mov = db.prepare("SELECT * FROM cxc_movimientos WHERE doc_venta_id = ? AND tipo = 'CARGO'").get(doc.id) as Fila
    expect(mov.monto_cent).toBe(47200)
    expect((db.prepare('SELECT balance_cent FROM clientes WHERE id = ?').get(clienteId) as Fila).balance_cent).toBe(47200)
    expect(db.prepare('SELECT * FROM documento_pagos WHERE doc_id = ?').all(doc.id)).toHaveLength(0)
    db.close()
  })

  it('la anulación revierte stock, genera NC y cancela el cargo CxC', () => {
    const { db, ventas, ctx, existencia, factura } = setup()
    const doc = factura('FACTURA_CREDITO')
    const resultado = ventas.anular(ctx, { id: doc.id, motivo: 'Error en el cliente' }) as { id: number; notaCreditoId: number }
    expect(resultado.notaCreditoId).toBeTruthy()
    expect(existencia()).toMatchObject({ cantidad: 100, valor_cent: 1000000 })

    const nc = db.prepare('SELECT * FROM documentos_venta WHERE id = ?').get(resultado.notaCreditoId) as Fila
    expect(nc).toMatchObject({ tipo: 'NOTA_CREDITO', doc_origen_id: doc.id, estado: 'ACTIVO' })
    expect((db.prepare('SELECT estado, saldo_cent FROM cxc_documentos WHERE doc_venta_id = ?').get(doc.id) as Fila))
      .toMatchObject({ estado: 'ANULADO', saldo_cent: 0 })
    expect(db.prepare("SELECT * FROM cxc_movimientos WHERE doc_venta_id = ? AND tipo = 'ANULACION'").all(doc.id)).toHaveLength(1)
    expect((db.prepare('SELECT estado FROM documentos_venta WHERE id = ?').get(doc.id) as Fila).estado).toBe('ANULADO')
    const kardex = db.prepare("SELECT COUNT(*) AS n FROM movimientos_inventario WHERE doc_tipo = 'NOTA_CREDITO' AND doc_id = ?").get(resultado.notaCreditoId) as Fila
    expect(kardex.n).toBe(1)
    db.close()
  })

  it('POS exige caja abierta pero nunca cobra: genera cargo CxC pendiente', () => {
    const { db, ctx, pos, clienteId, linea } = setup()
    expect(() => pos.vender(ctx, { clienteId, lineas: [linea()] })).toThrowError(DomainError)

    const { id: sesionId } = pos.abrirCaja(ctx, { montoCent: 5000, observaciones: 'Apertura prueba' }) as { id: number }
    const venta = pos.vender(ctx, { clienteId, lineas: [linea()] }) as { id: number; totalCent: number; cajaSesionId: number }
    expect(venta.totalCent).toBe(47200)
    expect(venta.cajaSesionId).toBe(sesionId)

    const doc = db.prepare('SELECT * FROM documentos_venta WHERE id = ?').get(venta.id) as Fila
    expect(doc.tipo).toBe('POS')
    expect(db.prepare('SELECT * FROM documento_pagos WHERE doc_id = ?').all(venta.id)).toHaveLength(0)
    expect(db.prepare("SELECT * FROM caja_movimientos WHERE doc_tipo = 'POS' AND doc_id = ?").all(venta.id)).toHaveLength(0)
    const cxc = db.prepare('SELECT * FROM cxc_documentos WHERE doc_venta_id = ?').get(venta.id) as Fila
    expect(cxc).toMatchObject({ monto_cent: 47200, saldo_cent: 47200, estado: 'PENDIENTE' })

    const cierre = pos.cerrarCaja(ctx, { sesionId, montoCent: 5000, observaciones: 'Arqueo' }) as { teoricoCent: number; diferenciaCent: number }
    expect(cierre.teoricoCent).toBe(5000)
    expect(cierre.diferenciaCent).toBe(0)
    db.close()
  })

  it('Ventas no acepta pagos: el importe íntegro queda pendiente de cobro', () => {
    const { db, ventas, ctx, clienteId, linea } = setup()
    ventas.factura(ctx, { tipo: 'FACTURA_CONTADO', clienteId, lineas: [linea()] })
    const cxc = db.prepare('SELECT saldo_cent FROM cxc_documentos').all() as Fila[]
    expect(cxc).toHaveLength(1)
    expect(cxc[0].saldo_cent).toBe(47200)
    expect(db.prepare('SELECT * FROM documento_pagos').all()).toHaveLength(0)
    db.close()
  })

  it('suspende y recupera un carrito sin afectar inventario', () => {
    const { db, pos, ctx, clienteId, linea, existencia } = setup()
    pos.abrirCaja(ctx, { montoCent: 0, observaciones: '' })
    const { id } = pos.suspender(ctx, { nombre: 'Mesa 4', carrito: { clienteId, lineas: [linea(3)] } }) as { id: number }
    expect(pos.suspendidas(ctx)).toHaveLength(1)
    const recuperado = pos.recuperar(ctx, id) as { carrito: { lineas: { cantidad: number }[] } }
    expect(recuperado.carrito.lineas[0].cantidad).toBe(3)
    expect(pos.suspendidas(ctx)).toHaveLength(0)
    expect(existencia().cantidad).toBe(100)
    db.close()
  })

  it('cotización → pedido → factura convierte sin duplicar movimientos de stock', () => {
    const { db, ventas, ctx, clienteId, linea, existencia } = setup()
    const cot = ventas.cotizacion(ctx, { clienteId, lineas: [linea(4)] }) as { id: number; totalCent: number }
    expect(existencia().cantidad).toBe(100)
    expect((db.prepare('SELECT estado FROM documentos_venta WHERE id = ?').get(cot.id) as Fila).estado).toBe('PENDIENTE')

    const pedido = ventas.convertir(ctx, { id: cot.id, tipoDestino: 'PEDIDO' }) as { id: number }
    expect((db.prepare('SELECT tipo FROM documentos_venta WHERE id = ?').get(pedido.id) as Fila).tipo).toBe('PEDIDO')
    expect((db.prepare('SELECT estado FROM documentos_venta WHERE id = ?').get(cot.id) as Fila).estado).toBe('CONVERTIDA')

    const fac = ventas.convertir(ctx, { id: pedido.id, tipoDestino: 'FACTURA_CONTADO' }) as { id: number; totalCent: number }
    expect(fac.totalCent).toBe(cot.totalCent)
    expect(existencia().cantidad).toBe(96)
    const movs = db.prepare("SELECT * FROM movimientos_inventario WHERE doc_tipo = 'FACTURA_CONTADO'").all() as Fila[]
    expect(movs).toHaveLength(1)
    db.close()
  })

  it('conduce controla entregas parciales sin exceder la cantidad del documento', () => {
    const { db, ventas, ctx, factura, linea } = setup()
    const doc = factura('FACTURA_CONTADO', [linea(4)])
    const { id: conduceId } = ventas.crearConduce(ctx, {
      docVentaId: doc.id,
      lineas: [{ docLineaId: Number((db.prepare('SELECT id FROM documento_venta_lineas WHERE doc_id = ?').get(doc.id) as Fila).id), cantidad: 3 }]
    }) as { id: number }
    const detalle = ventas.detalleConduce(ctx, conduceId) as { lineas: Fila[] }
    const conduceLineaId = Number(detalle.lineas[0].id)
    ventas.registrarEntrega(ctx, { conduceId, lineas: [{ conduceLineaId, cantidad: 1 }] })
    expect((db.prepare('SELECT cantidad_entregada FROM documento_venta_lineas WHERE doc_id = ?').get(doc.id) as Fila).cantidad_entregada).toBe(1)
    expect(() => ventas.registrarEntrega(ctx, { conduceId, lineas: [{ conduceLineaId, cantidad: 3 }] })).toThrow(/pendiente/i)
    ventas.registrarEntrega(ctx, { conduceId, lineas: [{ conduceLineaId, cantidad: 2 }] })
    expect((db.prepare('SELECT estado FROM conduces WHERE id = ?').get(conduceId) as Fila).estado).toBe('PARCIAL')
    db.close()
  })

  it('aplica permisos de descuento, creación y POS en el servicio', () => {
    const { db, ctx, ventas, clienteId, linea, factura, pos } = setup()
    const sinCrear = sinPermiso(ctx, 'ventas.crear')
    expect(() => ventas.factura(sinCrear, { tipo: 'FACTURA_CONTADO', clienteId, lineas: [linea()] })).toThrow()

    const sinDescuento = sinPermiso(ctx, 'ventas.descuento')
    expect(() => ventas.factura(sinDescuento, {
      tipo: 'FACTURA_CONTADO', clienteId, lineas: [linea(1, { descuentoPctBp: 1000 })]
    })).toThrow()

    const sinPos = sinPermiso(ctx, 'pos.crear')
    pos.abrirCaja(ctx, { montoCent: 0, observaciones: '' })
    expect(() => pos.vender(sinPos, { clienteId, lineas: [linea()] })).toThrow()
    void factura
    db.close()
  })

  it('aísla los documentos por empresa', () => {
    const { db, ctx, ventas, clienteId, factura, productoId } = setup()
    const doc = factura()
    db.prepare(`
      INSERT INTO empresas (id, nombre_comercial, razon_social, moneda_base)
      VALUES (2, 'EMPRESA 2', 'EMPRESA 2', 'DOP')
    `).run()
    seedCompany(db, 2)
    const ctx2: SessionContext = { ...ctx, empresaId: 2 }
    expect(ventas.documentos(ctx2, {})).toHaveLength(0)
    expect(() => ventas.detalle(ctx2, doc.id)).toThrow(/no encontrado/i)
    expect(() => ventas.factura(ctx2, { tipo: 'FACTURA_CONTADO', clienteId, lineas: [{ productoId, cantidad: 1 }] })).toThrow(/no encontrado/i)
    db.close()
  })

  it('usa NCF de serie configurada y bloquea series vencidas o fuera de rango', () => {
    const { db, ctx, factura } = setup()
    db.prepare(`
      UPDATE series_documento
      SET es_ncf = 1, rango_desde = 'FAC-00000001', rango_hasta = 'FAC-00000005', vence_en = '2099-12-31'
      WHERE empresa_id = 1 AND tipo_doc = 'FACTURA_CONTADO'
    `).run()
    const doc = factura()
    expect(doc.esNcf).toBe(true)
    expect(doc.numero).toBe('FAC-00000001')

    db.prepare("UPDATE series_documento SET vence_en = '2020-01-01' WHERE empresa_id = 1 AND tipo_doc = 'FACTURA_CONTADO'").run()
    expect(() => factura()).toThrow(/vencida/i)
    void ctx
    db.close()
  })

  it('expone catálogos por módulo sin requerir permisos de configuración', () => {
    const { db, ctx, ventas } = setup()
    const catalogos = ventas.catalogos(ctx, 'pos') as {
      clientes: unknown[]; productos: unknown[]; almacenes: unknown[];
      impuestos: unknown[]; vendedores: unknown[]; impuestoPorDefecto: string
    }
    expect(catalogos.clientes.length).toBeGreaterThan(0)
    expect(catalogos.productos.length).toBeGreaterThan(0)
    expect(catalogos.almacenes.length).toBeGreaterThan(0)
    expect(catalogos.impuestos.length).toBeGreaterThan(0)
    expect(catalogos.impuestoPorDefecto).toBe('ITBIS18')

    const sinMaestros = sinPermiso(sinPermiso(ctx, 'clientes.consultar'), 'productos.consultar')
    const filtrados = ventas.catalogos(sinMaestros, 'pos') as { clientes: unknown[]; productos: unknown[] }
    expect(filtrados.clientes).toHaveLength(0)
    expect(filtrados.productos).toHaveLength(0)
    db.close()
  })

  it('aplica permisos del módulo de cotizaciones en listado, detalle, impresión y anulación', () => {
    const { db, ctx, ventas, clienteId, linea, factura } = setup()
    const cotizacion = ventas.cotizacion(ctx, { clienteId, lineas: [linea(2)] }) as { id: number }
    const pedido = ventas.pedido(ctx, { clienteId, lineas: [linea(1)] }) as { id: number }
    const fac = factura()
    const soloCot: SessionContext = {
      ...ctx, permisos: ctx.permisos.filter((p) => p.startsWith('cotizaciones.'))
    }

    const listado = ventas.documentosCotizaciones(soloCot, {}) as Fila[]
    expect(listado.map((f) => f.id)).toEqual([cotizacion.id])
    expect((ventas.documentosCotizaciones(soloCot, { tipo: 'PEDIDO' }) as Fila[]).map((f) => f.id)).toEqual([pedido.id])
    expect(() => ventas.documentosCotizaciones(soloCot, { tipo: 'FACTURA_CONTADO' })).not.toThrow()
    expect((ventas.documentosCotizaciones(soloCot, { tipo: 'FACTURA_CONTADO' }) as Fila[])[0].tipo).toBe('COTIZACION')

    expect((ventas.detalle(soloCot, cotizacion.id) as { cabecera: Fila }).cabecera.tipo).toBe('COTIZACION')
    expect(() => ventas.detalle(soloCot, fac.id)).toThrow()
    expect((ventas.datosImpresion(soloCot, { id: cotizacion.id, formato: 'CARTA' }) as { formato: string }).formato).toBe('CARTA')
    expect(() => ventas.datosImpresion(soloCot, { id: fac.id })).toThrow()

    expect(ventas.anular(soloCot, { id: pedido.id, motivo: 'Prueba de permisos' })).toMatchObject({ id: pedido.id })
    expect(() => ventas.anular(soloCot, { id: fac.id, motivo: 'Prueba de permisos' })).toThrow()
    db.close()
  })

  it('exige el permiso de creación del documento destino al convertir', () => {
    const { db, ctx, ventas, clienteId, linea } = setup()
    const cotizacion = ventas.cotizacion(ctx, { clienteId, lineas: [linea(1)] }) as { id: number }
    const otra = ventas.cotizacion(ctx, { clienteId, lineas: [linea(1)] }) as { id: number }
    const soloCot = { ...ctx, permisos: ctx.permisos.filter((p) => p.startsWith('cotizaciones.')) }
    const soloVentas = { ...ctx, permisos: ctx.permisos.filter((p) => p.startsWith('ventas.')) }

    expect(() => ventas.convertir(soloCot, { id: cotizacion.id, tipoDestino: 'FACTURA_CONTADO' })).toThrow()
    const pedido = ventas.convertir(soloCot, { id: cotizacion.id, tipoDestino: 'PEDIDO' }) as { id: number }
    expect((db.prepare('SELECT tipo FROM documentos_venta WHERE id = ?').get(pedido.id) as Fila).tipo).toBe('PEDIDO')

    expect(() => ventas.convertir(soloVentas, { id: otra.id, tipoDestino: 'PEDIDO' })).toThrow()
    const factura = ventas.convertir(soloVentas, { id: otra.id, tipoDestino: 'FACTURA_CONTADO' }) as { id: number }
    expect((db.prepare('SELECT tipo FROM documentos_venta WHERE id = ?').get(factura.id) as Fila).tipo).toBe('FACTURA_CONTADO')
    db.close()
  })
})

describe('Ajustes administrativos — flujos de ventas', () => {
  it('exige ventas.aprobar en documentos finales sin umbral y lo audita', () => {
    const { db, ctx, ajustes, ventas, clienteId, linea } = setup()
    guardarFlujos(ajustes, ctx, { ventasRequierenAprobacion: true })
    const sinAprobar = sinPermiso(ctx, 'ventas.aprobar')

    expect(() => ventas.factura(sinAprobar, {
      tipo: 'FACTURA_CONTADO', clienteId, lineas: [linea()]
    })).toThrow(/permiso/i)
    expect(db.prepare("SELECT COUNT(*) AS n FROM documentos_venta WHERE tipo = 'FACTURA_CONTADO'").get()).toMatchObject({ n: 0 })
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad = 'flujos_aprobacion'").get()).toMatchObject({ n: 0 })

    const doc = ventas.factura(ctx, { tipo: 'FACTURA_CONTADO', clienteId, lineas: [linea()] }) as { id: number; totalCent: number }
    expect(doc.totalCent).toBe(47200)
    expect((db.prepare('SELECT estado FROM documentos_venta WHERE id = ?').get(doc.id) as Fila).estado).toBe('ACTIVO')
    expect((db.prepare('SELECT saldo_cent FROM cxc_documentos WHERE doc_venta_id = ?').get(doc.id) as Fila).saldo_cent).toBe(47200)
    const autorizacion = db.prepare("SELECT * FROM auditoria WHERE entidad = 'flujos_aprobacion'").get() as Fila
    expect(autorizacion.entidad_id).toBe(String(doc.id))
    expect(JSON.parse(String(autorizacion.valores_despues))).toMatchObject({
      tipo: 'FACTURA_CONTADO', totalCent: 47200, umbralCent: 0, via: 'PERMISO', permiso: 'ventas.aprobar'
    })
    db.close()
  })

  it('autoaprueba por umbral en centavos y vuelve a exigir permiso por encima de él', () => {
    const { db, ctx, ajustes, ventas, clienteId, linea } = setup()
    guardarFlujos(ajustes, ctx, { ventasRequierenAprobacion: true, autoAprobarHastaCent: 50000 })
    const sinAprobar = sinPermiso(ctx, 'ventas.aprobar')

    const doc = ventas.factura(sinAprobar, {
      tipo: 'FACTURA_CREDITO', clienteId, lineas: [linea()]
    }) as { id: number; totalCent: number }
    expect(doc.totalCent).toBe(47200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM cxc_documentos WHERE doc_venta_id = ?').get(doc.id)).toMatchObject({ n: 1 })
    expect(() => ventas.factura(sinAprobar, {
      tipo: 'FACTURA_CREDITO', clienteId, lineas: [linea(3)]
    })).toThrow(/permiso/i)
    expect(db.prepare("SELECT COUNT(*) AS n FROM documentos_venta WHERE tipo = 'FACTURA_CREDITO'").get()).toMatchObject({ n: 1 })

    const autorizaciones = db.prepare("SELECT valores_despues FROM auditoria WHERE entidad = 'flujos_aprobacion'").all() as Fila[]
    expect(autorizaciones).toHaveLength(1)
    expect(JSON.parse(String(autorizaciones[0].valores_despues))).toMatchObject({
      via: 'UMBRAL', totalCent: 47200, umbralCent: 50000, permiso: null
    })
    db.close()
  })

  it('POS también exige aprobación, pero cotizaciones y pedidos no', () => {
    const { db, ctx, ajustes, ventas, pos, clienteId, linea } = setup()
    guardarFlujos(ajustes, ctx, { ventasRequierenAprobacion: true })
    const sinAprobar = sinPermiso(ctx, 'ventas.aprobar')

    const cotizacion = ventas.cotizacion(sinAprobar, { clienteId, lineas: [linea()] }) as { id: number }
    const pedido = ventas.pedido(sinAprobar, { clienteId, lineas: [linea()] }) as { id: number }
    expect(cotizacion.id).toBeTruthy()
    expect(pedido.id).toBeTruthy()

    pos.abrirCaja(ctx, { montoCent: 0, observaciones: '' })
    expect(() => pos.vender(sinAprobar, { clienteId, lineas: [linea()] })).toThrow(/permiso/i)
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad = 'flujos_aprobacion'").get()).toMatchObject({ n: 0 })
    pos.vender(ctx, { clienteId, lineas: [linea()] })
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad = 'flujos_aprobacion'").get()).toMatchObject({ n: 1 })
    db.close()
  })

  it('anulación exige motivo de al menos 3 caracteres solo cuando el ajuste está activo', () => {
    const { db, ctx, ajustes, ventas, factura } = setup()
    const doc = factura()

    expect(() => ventas.anular(ctx, { id: doc.id, motivo: 'ab' })).toThrow(/3 caracteres/i)
    expect(() => ventas.anular(ctx, { id: doc.id, motivo: '' })).toThrow(/motivo/i)
    expect((db.prepare('SELECT estado FROM documentos_venta WHERE id = ?').get(doc.id) as Fila).estado).toBe('ACTIVO')

    guardarFlujos(ajustes, ctx, { anulacionRequiereMotivo: false })
    expect(ventas.anular(ctx, { id: doc.id, motivo: '' })).toMatchObject({ id: doc.id })
    const audit = db.prepare("SELECT valores_despues FROM auditoria WHERE operacion = 'ANULAR' AND entidad = 'documentos_venta' AND entidad_id = ?").get(String(doc.id)) as Fila
    expect(JSON.parse(String(audit.valores_despues)).motivo).toBe('Anulación solicitada')
    db.close()
  })
})

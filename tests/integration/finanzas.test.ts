import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import * as aux from '../../src/main/repositories/auxiliares.repo'
import * as cxp from '../../src/main/repositories/cxp.repo'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC').context as SessionContext
  const finanzas = createFinanzasService(db)

  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre, tipo, rnc_cedula)
    VALUES (1, 'CLI-FIN', 'Cliente Finanzas', 'EMPRESA', '101234567')
  `).run().lastInsertRowid)
  const proveedorId = Number(db.prepare(`
    INSERT INTO proveedores (empresa_id, codigo, nombre_comercial, razon_social, rnc)
    VALUES (1, 'PRO-FIN', 'Proveedor Finanzas', 'Proveedor Finanzas SRL', '101765432')
  `).run().lastInsertRowid)
  const vendedorId = Number(db.prepare(`
    INSERT INTO vendedores (empresa_id, codigo, nombre, comision_pct_bp)
    VALUES (1, 'VEN-FIN', 'Vendedor Finanzas', 1000)
  `).run().lastInsertRowid)

  const categoriaId = Number(db.prepare(`
    INSERT INTO gastos_categorias (empresa_id, codigo, nombre) VALUES (1, 'LUZ', 'Luz')
  `).run().lastInsertRowid)

  const correlativo = { venta: 0, compra: 0 }
  const crearCxc = (montoCent: number) => {
    correlativo.venta += 1
    const numero = `FCR-FIN-${correlativo.venta}`
    const docVentaId = Number(db.prepare(`
      INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, estado, total_cent)
      VALUES (1, 'FACTURA_CREDITO', ?, ?, ?, 'ACTIVO', ?)
    `).run(numero, clienteId, 'Cliente Finanzas', montoCent).lastInsertRowid)
    const cxcId = aux.crearCxc(db, {
      empresaId: 1, clienteId, docVentaId, numeroDocumento: numero,
      fecha: '2026-01-10', vencimiento: '2026-02-10', montoCent
    })
    aux.movimientoCxc(db, {
      empresaId: 1, clienteId, cxcDocumentoId: cxcId, docVentaId,
      tipo: 'CARGO', montoCent, referencia: numero, usuarioId: ctx.userId
    })
    aux.ajustarBalanceCliente(db, 1, clienteId, montoCent)
    return { cxcId, docVentaId }
  }

  const crearCxp = (montoCent: number) => {
    correlativo.compra += 1
    const numero = `FCO-FIN-${correlativo.compra}`
    const docCompraId = Number(db.prepare(`
      INSERT INTO documentos_compra (empresa_id, tipo, numero, proveedor_id, proveedor_nombre, estado, total_cent)
      VALUES (1, 'FACTURA_COMPRA', ?, ?, ?, 'CONTABILIZADO', ?)
    `).run(numero, proveedorId, 'Proveedor Finanzas', montoCent).lastInsertRowid)
    const cxpId = cxp.crearCxp(db, {
      empresaId: 1, proveedorId, docCompraId, numeroDocumento: numero,
      fecha: '2026-01-10', vencimiento: '2026-02-10', montoCent
    })
    cxp.movimientoCxp(db, {
      empresaId: 1, proveedorId, cxpDocumentoId: cxpId, docCompraId,
      tipo: 'CARGO', montoCent, referencia: numero, usuarioId: ctx.userId
    })
    cxp.ajustarBalanceProveedor(db, 1, proveedorId, montoCent)
    return { cxpId, docCompraId }
  }

  const saldoCxc = (id: number) => Number((db.prepare('SELECT saldo_cent FROM cxc_documentos WHERE id = ?').get(id) as Fila).saldo_cent)
  const estadoCxc = (id: number) => String((db.prepare('SELECT estado FROM cxc_documentos WHERE id = ?').get(id) as Fila).estado)
  const saldoCxp = (id: number) => Number((db.prepare('SELECT saldo_cent FROM cxp_documentos WHERE id = ?').get(id) as Fila).saldo_cent)
  const balanceCliente = () => Number((db.prepare('SELECT balance_cent FROM clientes WHERE id = ?').get(clienteId) as Fila).balance_cent)
  const balanceProveedor = () => Number((db.prepare('SELECT balance_cent FROM proveedores WHERE id = ?').get(proveedorId) as Fila).balance_cent)
  const saldoBanco = (id: number) => Number((db.prepare('SELECT saldo_cent FROM bancos_cuentas WHERE id = ?').get(id) as Fila).saldo_cent)

  return {
    db, ctx, finanzas, clienteId, proveedorId, vendedorId, categoriaId,
    crearCxc, crearCxp, saldoCxc, estadoCxc, saldoCxp, balanceCliente, balanceProveedor, saldoBanco
  }
}

const sinPermiso = (ctx: SessionContext, clave: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((p) => p !== clave)
})

describe('Fase 8 — finanzas: CxC, CxP, bancos, caja, gastos y comisiones', () => {
  it('la migración 006 crea tablas, columnas de arqueo y series internas', () => {
    const { db } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    for (const tabla of [
      'bancos_cuentas', 'bancos_movimientos', 'bancos_conciliaciones', 'bancos_conciliacion_lineas',
      'cxc_recibos', 'cxc_recibo_aplicaciones', 'cxp_pagos', 'cxp_pago_aplicaciones',
      'anticipos', 'gastos_categorias', 'gastos', 'gastos_recurrentes', 'comisiones'
    ]) expect(tablas).toContain(tabla)

    const columnas = (db.prepare('PRAGMA table_info(caja_sesiones)').all() as { name: string }[]).map((c) => c.name)
    for (const columna of ['arqueo_efectivo_cent', 'arqueo_otros_cent', 'usuario_cierre_id']) {
      expect(columnas).toContain(columna)
    }
    const series = (db.prepare('SELECT tipo_doc FROM series_documento WHERE empresa_id = 1').all() as Fila[])
      .map((s) => s.tipo_doc)
    expect(series).toContain('PAGO_CXP')
    expect(series).toContain('GASTO')
    db.close()
  })

  it('un recibo de caja aplica a varias facturas y su anulación restaura saldos', () => {
    const s = setup()
    const a = s.crearCxc(10000)
    const b = s.crearCxc(5000)
    const sesionId = Number((s.finanzas.cajasAbrir(s.ctx, { montoCent: 20000 }) as { id: number }).id)

    const recibo = s.finanzas.cxcReciboCrear(s.ctx, {
      clienteId: s.clienteId, montoCent: 15000, metodo: 'EFECTIVO', cajaSesionId: sesionId,
      aplicaciones: [
        { cxcDocumentoId: a.cxcId, montoCent: 10000 },
        { cxcDocumentoId: b.cxcId, montoCent: 5000 }
      ]
    }) as { id: number; numero: string }

    expect(recibo.numero).toMatch(/^RIN-\d+$/)
    expect(s.saldoCxc(a.cxcId)).toBe(0)
    expect(s.saldoCxc(b.cxcId)).toBe(0)
    expect(s.estadoCxc(a.cxcId)).toBe('PAGADO')
    expect(s.balanceCliente()).toBe(0)
    const movimiento = s.db.prepare('SELECT tipo, monto_cent, doc_tipo, doc_id FROM caja_movimientos WHERE doc_tipo = ?').get('RECIBO_INGRESO') as Fila
    expect(movimiento).toMatchObject({ tipo: 'INGRESO', monto_cent: 15000, doc_id: recibo.id })

    const detalle = s.finanzas.cxcDetalle(s.ctx, a.cxcId) as { aplicaciones: Fila[]; movimientos: Fila[] }
    expect(detalle.aplicaciones).toHaveLength(1)
    expect(detalle.movimientos.map((m) => m.tipo).sort()).toEqual(['ABONO', 'CARGO'])

    s.finanzas.cxcReciboAnular(s.ctx, { id: recibo.id, motivo: 'Error de cobro' })
    expect(s.saldoCxc(a.cxcId)).toBe(10000)
    expect(s.saldoCxc(b.cxcId)).toBe(5000)
    expect(s.balanceCliente()).toBe(15000)
    expect(Number((s.db.prepare('SELECT saldo_cent FROM anticipos').get() as Fila)?.saldo_cent ?? 0)).toBe(0)
    const reversas = s.db.prepare("SELECT COUNT(*) AS n FROM caja_movimientos WHERE doc_tipo = 'ANULACION_RECIBO'").get() as Fila
    expect(Number(reversas.n)).toBe(1)
    s.db.close()
  })

  it('un pago a proveedor contra varias facturas descuenta el banco y se revierte', () => {
    const s = setup()
    const a = s.crearCxp(9000)
    const b = s.crearCxp(6000)
    const cuentaId = Number((s.finanzas.bancosCuentaCrear(s.ctx, {
      codigo: 'BAN-01', nombre: 'Cuenta principal', saldoInicialCent: 30000
    }) as { id: number }).id)

    const pago = s.finanzas.cxpPagoCrear(s.ctx, {
      proveedorId: s.proveedorId, montoCent: 15000, metodo: 'TRANSFERENCIA', bancoCuentaId: cuentaId,
      aplicaciones: [
        { cxpDocumentoId: a.cxpId, montoCent: 9000 },
        { cxpDocumentoId: b.cxpId, montoCent: 6000 }
      ]
    }) as { id: number; numero: string }

    expect(pago.numero).toMatch(/^PAG-\d+$/)
    expect(s.saldoCxp(a.cxpId)).toBe(0)
    expect(s.saldoCxp(b.cxpId)).toBe(0)
    expect(s.balanceProveedor()).toBe(0)
    expect(s.saldoBanco(cuentaId)).toBe(15000)
    const movimiento = s.db.prepare('SELECT tipo, monto_cent, doc_tipo, doc_id FROM bancos_movimientos WHERE doc_tipo = ?').get('PAGO_CXP') as Fila
    expect(movimiento).toMatchObject({ tipo: 'TRANSFERENCIA', monto_cent: 15000, doc_id: pago.id })

    s.finanzas.cxpPagoAnular(s.ctx, { id: pago.id, motivo: 'Pago duplicado' })
    expect(s.saldoCxp(a.cxpId)).toBe(9000)
    expect(s.saldoCxp(b.cxpId)).toBe(6000)
    expect(s.balanceProveedor()).toBe(15000)
    expect(s.saldoBanco(cuentaId)).toBe(30000)
    s.db.close()
  })

  it('los anticipos se consumen en recibos y se devuelven al anular', () => {
    const s = setup()
    const doc = s.crearCxc(12000)
    const sesionId = Number((s.finanzas.cajasAbrir(s.ctx, { montoCent: 0 }) as { id: number }).id)
    const anticipo = s.finanzas.anticipoCrear(s.ctx, {
      tipo: 'CLIENTE', entidadId: s.clienteId, montoCent: 20000,
      metodo: 'EFECTIVO', cajaSesionId: sesionId
    }) as { id: number }

    const recibo = s.finanzas.cxcReciboCrear(s.ctx, {
      clienteId: s.clienteId, montoCent: 8000, anticipoId: anticipo.id,
      aplicaciones: [{ cxcDocumentoId: doc.cxcId, montoCent: 8000 }]
    }) as { id: number }

    expect(s.saldoCxc(doc.cxcId)).toBe(4000)
    expect(Number((s.db.prepare('SELECT saldo_cent FROM anticipos WHERE id = ?').get(anticipo.id) as Fila).saldo_cent)).toBe(12000)
    s.finanzas.cxcReciboAnular(s.ctx, { id: recibo.id, motivo: 'Aplicación incorrecta' })
    expect(Number((s.db.prepare('SELECT saldo_cent FROM anticipos WHERE id = ?').get(anticipo.id) as Fila).saldo_cent)).toBe(20000)
    s.db.close()
  })

  it('bancos registra depósitos, retiros y conciliaciones sin cuadrar saldos inventados', () => {
    const s = setup()
    const cuentaId = Number((s.finanzas.bancosCuentaCrear(s.ctx, {
      codigo: 'BAN-02', nombre: 'Ahorros', saldoInicialCent: 10000
    }) as { id: number }).id)
    const deposito = s.finanzas.bancosMovimientoCrear(s.ctx, {
      cuentaId, tipo: 'DEPOSITO', montoCent: 5000, descripcion: 'Depósito real'
    }) as { id: number }
    const retiro = s.finanzas.bancosMovimientoCrear(s.ctx, {
      cuentaId, tipo: 'RETIRO', montoCent: 2000, descripcion: 'Retiro real'
    }) as { id: number }
    expect(s.saldoBanco(cuentaId)).toBe(13000)
    expect(Number((s.db.prepare('SELECT monto_cent FROM bancos_movimientos WHERE id = ?').get(retiro.id) as Fila).monto_cent)).toBe(-2000)

    const conciliacion = s.finanzas.bancosConciliacionCrear(s.ctx, {
      cuentaId, saldoBancoCent: 13000, movimientoIds: [deposito.id, retiro.id]
    }) as { id: number; diferenciaCent: number; conciliados: number }
    expect(conciliacion).toMatchObject({ diferenciaCent: 0, conciliados: 2 })
    expect(() => s.finanzas.bancosMovimientoAnular(s.ctx, { id: retiro.id, motivo: 'Ya conciliado' })).toThrow()
    s.db.close()
  })

  it('caja cierra con arqueo y diferencia reales, una sola vez', () => {
    const s = setup()
    const sesionId = Number((s.finanzas.cajasAbrir(s.ctx, { montoCent: 10000 }) as { id: number }).id)
    s.finanzas.cajasMovimientoCrear(s.ctx, {
      sesionId, tipo: 'INGRESO', montoCent: 2500, descripcion: 'Ingreso manual'
    })
    const cierre = s.finanzas.cajasCerrar(s.ctx, {
      sesionId, arqueoEfectivoCent: 12000, arqueoOtrosCent: 500
    }) as { arqueoCent: number; teoricoCent: number; diferenciaCent: number }
    expect(cierre).toMatchObject({ arqueoCent: 12500, teoricoCent: 12500, diferenciaCent: 0 })
    const sesion = s.db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(sesionId) as Fila
    expect(sesion).toMatchObject({
      estado: 'CERRADA', monto_cierre_cent: 12500, arqueo_efectivo_cent: 12000, arqueo_otros_cent: 500
    })
    expect(() => s.finanzas.cajasCerrar(s.ctx, { sesionId, arqueoEfectivoCent: 1 })).toThrow()
    s.db.close()
  })

  it('gastos y recurrentes generan documentos reales; pagos y anulaciones reversan el dinero', () => {
    const s = setup()
    const sesionId = Number((s.finanzas.cajasAbrir(s.ctx, { montoCent: 20000 }) as { id: number }).id)
    const gasto = s.finanzas.gastosCrear(s.ctx, {
      categoriaId: s.categoriaId, proveedorId: s.proveedorId, concepto: 'Factura de luz',
      montoCent: 1000, impuestoCent: 180, metodo: 'EFECTIVO'
    }) as { id: number; numero: string; estado: string }
    expect(gasto.numero).toMatch(/^GAS-\d+$/)
    expect(gasto.estado).toBe('PENDIENTE')

    s.finanzas.gastosPagar(s.ctx, { id: gasto.id, metodo: 'EFECTIVO', cajaSesionId: sesionId })
    expect(Number((s.db.prepare('SELECT estado FROM gastos WHERE id = ?').get(gasto.id) as Fila).estado === 'CONTABILIZADO')).toBe(1)
    expect(Number((s.db.prepare('SELECT SUM(monto_cent) AS n FROM caja_movimientos WHERE doc_tipo = ?').get('GASTO') as Fila).n)).toBe(1180)
    s.finanzas.gastosAnular(s.ctx, { id: gasto.id, motivo: 'Gasto duplicado' })
    expect(Number((s.db.prepare('SELECT SUM(monto_cent) AS n FROM caja_movimientos WHERE doc_tipo = ?').get('ANULACION_GASTO') as Fila).n)).toBe(1180)

    const recurrente = s.finanzas.gastosRecurrenteCrear(s.ctx, {
      categoriaId: s.categoriaId, concepto: 'Alquiler mensual', montoCent: 5000,
      frecuencia: 'MENSUAL', proximaFecha: '2026-03-01'
    }) as { id: number }
    const generado = s.finanzas.gastosRecurrenteGenerar(s.ctx, recurrente.id) as { id: number }
    expect(Number((s.db.prepare('SELECT total_cent FROM gastos WHERE id = ?').get(generado.id) as Fila).total_cent)).toBe(5000)
    expect((s.db.prepare('SELECT proxima_fecha FROM gastos_recurrentes WHERE id = ?').get(recurrente.id) as Fila).proxima_fecha).toBe('2026-04-01')
    s.db.close()
  })

  it('comisiones calculan puntos base y pagan contra banco', () => {
    const s = setup()
    const docVentaId = Number(dbInsertVenta(s.db, s.clienteId))
    const cuentaId = Number((s.finanzas.bancosCuentaCrear(s.ctx, {
      codigo: 'BAN-03', nombre: 'Comisiones', saldoInicialCent: 10000
    }) as { id: number }).id)
    const comision = s.finanzas.comisionCrear(s.ctx, {
      vendedorId: s.vendedorId, docVentaId, baseCent: 10000, pctBp: 1000
    }) as { id: number; montoCent: number }
    expect(comision.montoCent).toBe(1000)
    s.finanzas.comisionPagar(s.ctx, {
      id: comision.id, metodo: 'BANCO', bancoCuentaId: cuentaId, referencia: 'Transferencia 001'
    })
    expect(s.saldoBanco(cuentaId)).toBe(9000)
    expect((s.db.prepare('SELECT estado FROM comisiones WHERE id = ?').get(comision.id) as Fila).estado).toBe('PAGADA')
    s.db.close()
  })

  it('verifica permisos en el backend para crear cobros, pagar gastos y cerrar caja', () => {
    const s = setup()
    const doc = s.crearCxc(1000)
    expect(() => s.finanzas.cxcReciboCrear(sinPermiso(s.ctx, 'cxc.crear'), {
      clienteId: s.clienteId, montoCent: 1000, metodo: 'TRANSFERENCIA', bancoCuentaId: 99,
      aplicaciones: [{ cxcDocumentoId: doc.cxcId, montoCent: 1000 }]
    })).toThrow(/permiso/i)
    expect(() => s.finanzas.gastosPagar(sinPermiso(s.ctx, 'gastos.aprobar'), { id: 1 })).toThrow(/permiso/i)
    expect(() => s.finanzas.cajasCerrar(sinPermiso(s.ctx, 'cajas.cerrar_caja'), {
      sesionId: 1, arqueoEfectivoCent: 0
    })).toThrow(/permiso/i)
    s.db.close()
  })
})

function dbInsertVenta(db: ReturnType<typeof testDb>, clienteId: number): number {
  return Number(db.prepare(`
    INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, estado, total_cent)
    VALUES (1, 'FACTURA_CONTADO', 'FAC-FIN-COM', ?, 'Cliente Finanzas', 'ACTIVO', 10000)
  `).run(clienteId).lastInsertRowid)
}

import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_PASSWORD, FIRST_RUN_USER } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { createFinanzasService } from '../../src/main/services/finanzas.service'
import { createInteligenciaService } from '../../src/main/services/inteligencia.service'
import { createModulos2026Service } from '../../src/main/services/modulos2026.service'
import { panelHorizontalFiltroSchema } from '@shared/schemas/panel-horizontal'
import type { SessionContext } from '@shared/session'

const sinPermiso = (ctx: SessionContext, clave: string): SessionContext => ({
  ...ctx, permisos: ctx.permisos.filter((p) => p !== clave)
})

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const ctx = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC').context as SessionContext
  const ajustes = createAjustesService(db)
  const finanzas = createFinanzasService(db, ajustes)
  const inteligencia = createInteligenciaService(db, ajustes)
  const modulos = createModulos2026Service(db, ajustes)

  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre, tipo, rnc_cedula, limite_credito_cent, balance_cent)
    VALUES (1, 'CLI-PH', 'Cliente Panel', 'EMPRESA', '101234567', 100000, 150000)
  `).run().lastInsertRowid)
  const docVentaId = Number(db.prepare(`
    INSERT INTO documentos_venta (empresa_id, tipo, numero, cliente_id, cliente_nombre, estado, total_cent)
    VALUES (1, 'FACTURA_CREDITO', 'FAC-PH-1', ?, 'Cliente Panel', 'ACTIVO', 50000)
  `).run(clienteId).lastInsertRowid)
  db.prepare(`
    INSERT INTO cxc_documentos (empresa_id, cliente_id, doc_venta_id, numero_documento, fecha, vencimiento, monto_cent, saldo_cent)
    VALUES (1, ?, ?, 'FAC-PH-1', '2020-01-01', '2020-02-01', 50000, 50000)
  `).run(clienteId, docVentaId)
  const reciboId = Number(db.prepare(`
    INSERT INTO cxc_recibos (empresa_id, numero, cliente_id, cliente_nombre, fecha, monto_cent)
    VALUES (1, 'REC-PH-1', ?, 'Cliente Panel', '2020-02-10', 1000)
  `).run(clienteId).lastInsertRowid)
  db.prepare(`
    INSERT INTO cxc_recibo_aplicaciones (empresa_id, recibo_id, cxc_documento_id, monto_cent)
    VALUES (1, ?, (SELECT id FROM cxc_documentos WHERE numero_documento = 'FAC-PH-1'), 1000)
  `).run(reciboId)

  const productoId = Number(db.prepare(`
    INSERT INTO productos (empresa_id, codigo, descripcion, precio1_cent, costo_promedio_cent, existencia_min)
    VALUES (1, 'PRO-PH', 'Producto Panel', 20000, 10000, 5)
  `).run().lastInsertRowid)
  db.prepare(`
    INSERT INTO existencias (empresa_id, producto_id, almacen_id, cantidad, valor_cent)
    VALUES (1, ?, 1, 2, 20000)
  `).run(productoId)
  db.prepare(`
    INSERT INTO movimientos_inventario
      (empresa_id, fecha, tipo, producto_id, almacen_id, cantidad, costo_unit_cent,
       costo_total_cent, saldo_cantidad, saldo_costo_cent, doc_tipo, motivo)
    VALUES (1, '2026-01-15', 'VENTA', ?, 1, -3, 10000, -30000, 2, 20000, 'FACTURA', 'Venta panel')
  `).run(productoId)

  const presupuesto = modulos.presupuestoCrear(ctx, {
    nombre: 'Presupuesto Panel', periodo: '2026-01', centroCosto: 'GENERAL', observaciones: '',
    lineas: [{ categoria: 'OPERACIONES', descripcion: 'Línea panel', montoCent: 100000 }]
  }) as { id: number }
  modulos.cambiarPresupuestoEstado(ctx, { id: presupuesto.id, estado: 'APROBADO', motivo: '' })
  modulos.presupuestoEjecutar(ctx, { id: presupuesto.id, montoCent: 85000, descripcion: 'Ejecución panel' })

  const servicioId = Number(db.prepare(`
    INSERT INTO servicios_catalogo (empresa_id, codigo, nombre, precio_cent, duracion_min)
    VALUES (1, 'SER-PH', 'Servicio Panel', 10000, 60)
  `).run().lastInsertRowid)
  db.prepare(`
    INSERT INTO ordenes_servicio
      (empresa_id, numero, cliente_id, cliente_nombre, fecha_compromiso, estado, prioridad, total_cent)
    VALUES (1, 'OS-PH-1', ?, 'Cliente Panel', '2020-03-01', 'RECIBIDA', 'ALTA', 10000)
  `).run(clienteId)
  db.prepare(`
    INSERT INTO orden_servicio_lineas (empresa_id, orden_id, servicio_id, descripcion, cantidad, precio_cent, total_cent)
    VALUES (1, (SELECT id FROM ordenes_servicio WHERE numero = 'OS-PH-1'), ?, 'Servicio Panel', 2, 10000, 20000)
  `).run(servicioId)
  db.prepare(`
    INSERT INTO crm_leads (empresa_id, numero, nombre, empresa, estado, probabilidad, valor_estimado_cent, proximo_seguimiento)
    VALUES (1, 'LEAD-PH-1', 'Lead Panel', 'Empresa Lead', 'NUEVO', 40, 50000, '2020-04-01')
  `).run()

  const sesion = finanzas.cajasAbrir(ctx, { montoCent: 10000 }) as { id: number }
  finanzas.cajasMovimientoCrear(ctx, {
    sesionId: sesion.id, tipo: 'INGRESO', montoCent: 2500, descripcion: 'Ingreso panel'
  })
  const cuenta = finanzas.bancosCuentaCrear(ctx, {
    codigo: 'BAN-PH', nombre: 'Cuenta Panel', saldoInicialCent: 10000
  }) as { id: number }
  finanzas.bancosMovimientoCrear(ctx, {
    cuentaId: cuenta.id, fecha: '2026-01-10', tipo: 'DEPOSITO', montoCent: 1000, referencia: 'SIN-SOPORTE'
  })

  return { db, ctx, ajustes, finanzas, inteligencia, modulos, clienteId, productoId }
}

describe('Panel horizontal avanzado — datos reales y permisos', () => {
  it('el filtro compartido aplica defaults y rechaza valores fuera de rango', () => {
    expect(panelHorizontalFiltroSchema.parse({})).toMatchObject({
      texto: '', limite: 8, soloUrgentes: false
    })
    expect(() => panelHorizontalFiltroSchema.parse({ limite: 51 })).toThrow()
    expect(() => panelHorizontalFiltroSchema.parse({ desde: '01-01-2026' })).toThrow()
  })

  it('la cola de cobranza prioriza vencimiento, crédito excedido y recencia', () => {
    const { db, ctx, finanzas } = setup()
    const datos = finanzas.colaCobro(ctx, { limite: 5 })
    expect(datos.umbralDias).toBeGreaterThan(0)
    expect(datos.resumen.documentos).toBe(1)
    expect(datos.resumen.saldoCent).toBe(50000)
    expect(datos.filas[0]).toMatchObject({
      numero: 'FAC-PH-1', saldoCent: 50000, ultimoRecibo: '2020-02-10',
      excesoCreditoCent: 50000, urgente: true, bucket: 'MAS_60'
    })
    expect(datos.filas[0].score).toBeGreaterThan(60)
    expect(() => finanzas.colaCobro(sinPermiso(ctx, 'cxc.consultar'), {})).toThrow(/permiso/i)
    db.close()
  })

  it('el ranking ABC clasifica por rotación y marca reposición crítica', () => {
    const { db, ctx, inteligencia } = setup()
    const datos = inteligencia.rankingAbc(ctx, {})
    expect(datos.filas).toHaveLength(1)
    expect(datos.filas[0]).toMatchObject({
      codigo: 'PRO-PH', clase: 'A', nivel: 'CRITICO', consumo: 3, existencia: 2
    })
    expect(datos.resumen.criticos).toBe(1)
    expect(() => inteligencia.rankingAbc(sinPermiso(ctx, 'inventario.consultar'), {})).toThrow(/permiso/i)
    db.close()
  })

  it('la agenda mezcla servicios y CRM válidos, con carga por técnico', () => {
    const { db, ctx, modulos } = setup()
    const datos = modulos.agendaOperativa(ctx, {})
    expect(datos.secciones).toEqual({ servicios: true, crm: true })
    expect(datos.ordenes[0]).toMatchObject({ numero: 'OS-PH-1', minutos: 120, vencida: true })
    expect(datos.leads[0]).toMatchObject({ nombre: 'LEAD-PH-1 · Lead Panel', vencido: true })
    expect(datos.resumen).toMatchObject({ ordenesVencidas: 1, leadsVencidos: 1, minutos: 120 })
    const soloCrm = modulos.agendaOperativa(sinPermiso(ctx, 'servicios.consultar'), {})
    expect(soloCrm.secciones).toEqual({ servicios: false, crm: true })
    expect(soloCrm.ordenes).toEqual([])
    expect(soloCrm.leads).toHaveLength(1)
    db.close()
  })

  it('la desviación presupuestaria respeta el umbral de alertas de ajustes', () => {
    const { db, ctx, ajustes, modulos } = setup()
    const datos = modulos.presupuestoDesviaciones(ctx, {})
    expect(datos.filas[0]).toMatchObject({
      montoCent: 100000, ejecutadoCent: 85000, disponibleCent: 15000,
      pctEjecutado: 85, nivel: datos.umbralPct <= 85 ? 'ALERTA' : 'NORMAL'
    })
    expect((ajustes.get(ctx, {}) as { alertas: { presupuestoPct: number } }).alertas.presupuestoPct).toBe(datos.umbralPct)
    expect(() => modulos.presupuestoDesviaciones(sinPermiso(ctx, 'presupuestos.consultar'), {})).toThrow(/permiso/i)
    db.close()
  })

  it('el cuadre revela diferencias de caja y movimientos bancarios sin soporte', () => {
    const { db, ctx, finanzas } = setup()
    const datos = finanzas.cuadreOperativo(ctx, {})
    expect(datos.secciones).toEqual({ cajas: true, bancos: true })
    expect(datos.caja[0]).toMatchObject({ estado: 'ABIERTA', teoricoCent: 12500, arqueoCent: 0 })
    expect(datos.caja[0].diferenciaCent).toBe(-12500)
    expect(datos.banco).toHaveLength(1)
    expect(datos.movimientosSinSoporte).toHaveLength(1)
    expect(datos.resumen.sinSoporte).toBe(1)
    const soloCajas = finanzas.cuadreOperativo(sinPermiso(ctx, 'bancos.consultar'), {})
    expect(soloCajas.secciones).toEqual({ cajas: true, bancos: false })
    expect(soloCajas.banco).toEqual([])
    expect(() => finanzas.cuadreOperativo(
      sinPermiso(sinPermiso(ctx, 'bancos.consultar'), 'cajas.consultar'), {}
    )).toThrow()
    db.close()
  })

  it('el filtro texto y soloUrgentes se aplican en el backend, no en el renderer', () => {
    const { db, ctx, finanzas } = setup()
    const filtrado = finanzas.colaCobro(ctx, { texto: 'NO-EXISTE' })
    expect(filtrado.filas).toEqual([])
    expect(filtrado.resumen.documentos).toBe(0)
    const normal = finanzas.colaCobro(ctx, {})
    expect(normal.filas[0].numero).toBe('FAC-PH-1')
    expect(normal.filas[0].saldoCent).toBe(50000)
    db.close()
  })
})

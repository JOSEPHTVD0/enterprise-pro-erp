import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { FIRST_RUN_USER, FIRST_RUN_PASSWORD } from '../../src/main/db/seed'
import { createAuthService } from '../../src/main/services/auth.service'
import { createModulos2026Service } from '../../src/main/services/modulos2026.service'
import { createAjustesService } from '../../src/main/services/ajustes.service'
import { defaultAjustes } from '@shared/schemas/ajustes'
import { createDashboardEjecutivoService } from '../../src/main/services/dashboard-ejecutivo.service'
import { createSaludService } from '../../src/main/services/salud.service'
import type { SessionContext } from '@shared/session'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)

function setup() {
  const db = testDb()
  const auth = createAuthService(db)
  const login = auth.login({ username: FIRST_RUN_USER, password: FIRST_RUN_PASSWORD }, 'TEST-PC')
  const ctx = login.context as SessionContext
  const ajustes = createAjustesService(db)
  const modulos = createModulos2026Service(db, ajustes)
  const ejecutivo = createDashboardEjecutivoService(db)
  const salud = createSaludService(db)

  const clienteId = Number(db.prepare(`
    INSERT INTO clientes (empresa_id, codigo, nombre) VALUES (1, 'CLI-MOD-2026', 'Cliente Módulos')
  `).run().lastInsertRowid)

  return { db, ctx, ajustes, modulos, ejecutivo, salud, clienteId }
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

describe('v0.3.0 — módulos nuevos, panel ejecutivo y salud', () => {
  it('la migración 007 crea tablas, índices y series propias', () => {
    const { db } = setup()
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Fila[]).map((t) => String(t.name))
    for (const t of [
      'presupuestos', 'presupuesto_lineas', 'servicios_catalogo', 'ordenes_servicio',
      'orden_servicio_lineas', 'activos', 'activos_depreciaciones', 'crm_leads', 'crm_seguimientos'
    ]) expect(tablas).toContain(t)
    const series = (db.prepare('SELECT tipo_doc FROM series_documento WHERE empresa_id = 1').all() as Fila[])
      .map((s) => String(s.tipo_doc))
    for (const tipo of ['PRESUPUESTO', 'ORDEN_SERVICIO', 'ACTIVO', 'LEAD']) expect(series).toContain(tipo)
    db.close()
  })

  it('presupuesto: crea, aprueba, ejecuta y deja auditoría', () => {
    const { db, ctx, modulos } = setup()
    const presupuesto = modulos.presupuestoCrear(ctx, {
      nombre: 'Presupuesto 2027', periodo: '2027-01', centroCosto: 'OPERACIONES',
      observaciones: 'Plan anual', lineas: [
        { categoria: 'MARKETING', descripcion: 'Campaña', montoCent: 100000 }
      ]
    }) as { id: number; numero: string }
    expect(presupuesto.numero).toMatch(/^PRE-/)

    modulos.cambiarPresupuestoEstado(ctx, { id: presupuesto.id, estado: 'APROBADO', motivo: 'Aprobado' })
    modulos.presupuestoEjecutar(ctx, { id: presupuesto.id, montoCent: 40000, descripcion: 'Ejecución parcial' })

    const fila = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(presupuesto.id) as Fila
    expect(String(fila.estado)).toBe('APROBADO')
    expect(n(fila, 'monto_cent')).toBe(100000)
    expect(n(fila, 'ejecutado_cent')).toBe(40000)
    const linea = db.prepare('SELECT ejecutado_cent FROM presupuesto_lineas WHERE presupuesto_id = ?').get(presupuesto.id) as Fila
    expect(n(linea, 'ejecutado_cent')).toBe(40000)
    const audit = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad = 'presupuestos'")
      .get() as Fila
    expect(n(audit, 'n')).toBeGreaterThanOrEqual(3)
    expect(() => modulos.presupuestoEjecutar(ctx, { id: presupuesto.id, montoCent: 70000 })).toThrow()
    db.close()
  })

  it('presupuesto: rechaza ejecutar sin permiso en el backend', () => {
    const { db, ctx, modulos } = setup()
    const presupuesto = modulos.presupuestoCrear(ctx, {
      nombre: 'Presupuesto sin permiso', periodo: '2027-02', observaciones: '',
      lineas: [{ categoria: 'GENERAL', descripcion: 'Línea', montoCent: 50000 }]
    }) as { id: number }
    modulos.cambiarPresupuestoEstado(ctx, { id: presupuesto.id, estado: 'APROBADO', motivo: '' })
    expect(() => modulos.presupuestoEjecutar(sinPermiso(ctx, 'presupuestos.ejecutar'), {
      id: presupuesto.id, montoCent: 1000
    })).toThrow(/permiso/i)
    db.close()
  })

  it('servicios: catálogo, orden con ITBIS y cierre de estado', () => {
    const { db, ctx, modulos, clienteId } = setup()
    const servicio = modulos.servicioCatalogoCrear(ctx, {
      codigo: 'SRV-TEST', nombre: 'Mantenimiento', descripcion: 'Visita técnica',
      precioCent: 10000, duracionMin: 60, activo: true
    }) as { id: number }
    const orden = modulos.ordenServicioCrear(ctx, {
      clienteId, prioridad: 'ALTA', tasaBp: 1800, diagnostico: 'Revisión', observaciones: '',
      lineas: [{ servicioId: servicio.id, cantidad: 2 }]
    }) as { id: number; numero: string }
    expect(orden.numero).toMatch(/^OS-/)
    const fila = db.prepare('SELECT * FROM ordenes_servicio WHERE id = ?').get(orden.id) as Fila
    expect(n(fila, 'subtotal_cent')).toBe(20000)
    expect(n(fila, 'impuesto_cent')).toBe(3600)
    expect(n(fila, 'total_cent')).toBe(23600)
    modulos.ordenServicioEstado(ctx, { id: orden.id, estado: 'FINALIZADA', motivo: 'Trabajo terminado' })
    expect(String((db.prepare('SELECT estado FROM ordenes_servicio WHERE id = ?').get(orden.id) as Fila).estado)).toBe('FINALIZADA')
    db.close()
  })

  it('activos: depreciación mensual única y valor neto', () => {
    const { db, ctx, modulos } = setup()
    const activo = modulos.activoCrear(ctx, {
      nombre: 'Laptop', categoria: 'EQUIPO', codigoInterno: 'LAP-01', ubicacion: 'Oficina',
      fechaCompra: '2027-01-15', valorAdquisicionCent: 120000, valorResidualCent: 0,
      vidaUtilMeses: 12, observaciones: ''
    }) as { id: number; numero: string }
    expect(activo.numero).toMatch(/^ACT-/)
    const resultado = modulos.activoDepreciar(ctx, { id: activo.id, periodo: '2027-01' }) as Fila
    expect(n(resultado, 'montoCent')).toBe(10000)
    expect(() => modulos.activoDepreciar(ctx, { id: activo.id, periodo: '2027-01' })).toThrow()
    const fila = db.prepare('SELECT * FROM activos WHERE id = ?').get(activo.id) as Fila
    expect(n(fila, 'depreciacion_acumulada_cent')).toBe(10000)
    expect(() => modulos.activoDepreciar(sinPermiso(ctx, 'activos.depreciar'), {
      id: activo.id, periodo: '2027-02'
    })).toThrow(/permiso/i)
    db.close()
  })

  it('CRM: seguimiento y conversión crean un cliente real sin duplicar', () => {
    const { db, ctx, modulos } = setup()
    const lead = modulos.leadCrear(ctx, {
      nombre: 'Ana Pérez', empresa: 'Nueva Oportunidad', rncCedula: '40200000001',
      telefono: '8095550000', email: 'ana@example.com', origen: 'REFERIDO',
      probabilidad: 50, valorEstimadoCent: 250000, proximoSeguimiento: '2027-02-01', observaciones: ''
    }) as { id: number; numero: string }
    expect(lead.numero).toMatch(/^LED-/)
    modulos.seguimientoCrear(ctx, { leadId: lead.id, tipo: 'LLAMADA', descripcion: 'Primer contacto', proximoSeguimiento: '2027-02-05' })
    const convertido = modulos.leadConvertir(ctx, { leadId: lead.id }) as { clienteId: number; numero: string }
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(convertido.clienteId) as Fila
    expect(String(cliente.nombre)).toBe('Ana Pérez')
    expect(String(cliente.rnc_cedula)).toBe('40200000001')
    expect(() => modulos.leadConvertir(ctx, { leadId: lead.id })).toThrow()
    expect(() => modulos.leadConvertir(sinPermiso(ctx, 'crm.convertir'), { leadId: lead.id })).toThrow(/permiso/i)
    db.close()
  })

  it('panel ejecutivo devuelve KPIs reales y oculta utilidad sin permiso', () => {
    const { db, ctx, ejecutivo } = setup()
    db.prepare(`
      INSERT INTO documentos_venta
        (empresa_id, tipo, numero, cliente_id, cliente_nombre, total_cent, costo_total_cent, estado)
      VALUES (1, 'FACTURA_CONTADO', 'FAC-EXEC-1', 1, 'Cliente Módulos', 150000, 90000, 'ACTIVO')
    `).run()
    const datos = ejecutivo.resumen(ctx, { periodo: 'ANIO' }) as Fila
    expect(n(datos.kpis as Fila, 'ventasCent')).toBe(150000)
    expect(n(datos.kpis as Fila, 'utilidadCent')).toBe(60000)
    const sinGanancia = ejecutivo.resumen(sinPermiso(ctx, 'reportes.ganancia'), { periodo: 'ANIO' }) as Fila
    expect((sinGanancia.kpis as Fila).utilidadCent).toBeNull()

    const serie = datos.serieMensual as Fila[]
    expect(serie.length).toBe(1)
    expect(n(serie[0], 'ventasCent')).toBe(150000)
    db.close()
  })

  it('panel de salud verifica integridad y expone conteos reales', () => {
    const { db, ctx, salud } = setup()
    const datos = salud.resumen(ctx) as Fila
    expect(datos.calificacion).toBeDefined()
    expect((datos.comprobaciones as Fila[]).some((c) => String(c.nombre) === 'Integridad SQLite')).toBe(true)
    expect(Number(datos.puntaje)).toBeGreaterThanOrEqual(0)
    expect(Number((datos.baseDatos as Fila).tablas)).toBeGreaterThan(20)
    expect(() => salud.resumen(sinPermiso(ctx, 'salud.consultar'))).toThrow(/permiso/i)
    db.close()
  })
})

describe('Ajustes administrativos — estados de orden de servicio', () => {
  it('usa el primer estado configurado como inicial y valida cambios, con terminales legacy', () => {
    const { db, ctx, ajustes, modulos, clienteId } = setup()
    guardarFlujos(ajustes, ctx, { estadosOrden: ['EN_PROCESO'] })

    const servicio = modulos.servicioCatalogoCrear(ctx, {
      codigo: 'SRV-FLUJOS', nombre: 'Instalación', descripcion: '', precioCent: 10000, activo: true
    }) as { id: number }
    const orden = modulos.ordenServicioCrear(ctx, {
      clienteId, prioridad: 'NORMAL', diagnostico: '', observaciones: '',
      lineas: [{ servicioId: servicio.id, cantidad: 1 }]
    }) as { id: number }
    expect((db.prepare('SELECT estado FROM ordenes_servicio WHERE id = ?').get(orden.id) as Fila).estado).toBe('EN_PROCESO')
    const alta = db.prepare("SELECT valores_despues FROM auditoria WHERE operacion = 'CREAR_ORDEN_SERVICIO' AND entidad_id = ?").get(String(orden.id)) as Fila
    expect(JSON.parse(String(alta.valores_despues)).estado).toBe('EN_PROCESO')

    expect(() => modulos.ordenServicioEstado(ctx, {
      id: orden.id, estado: 'PENDIENTE_CLIENTE', motivo: 'Fuera de la lista'
    })).toThrow(/no válido/i)

    guardarFlujos(ajustes, ctx, { estadosOrden: ['RECIBIDA', 'PENDIENTE_CLIENTE'] })
    modulos.ordenServicioEstado(ctx, { id: orden.id, estado: 'PENDIENTE_CLIENTE', motivo: 'Espera del cliente' })
    expect((db.prepare('SELECT estado FROM ordenes_servicio WHERE id = ?').get(orden.id) as Fila).estado).toBe('PENDIENTE_CLIENTE')
    const cambio = db.prepare("SELECT valores_despues FROM auditoria WHERE operacion = 'ORDEN_SERVICIO_PENDIENTE_CLIENTE' AND entidad_id = ?").get(String(orden.id)) as Fila
    expect(JSON.parse(String(cambio.valores_despues))).toMatchObject({
      estado: 'PENDIENTE_CLIENTE', estadosOrden: ['RECIBIDA', 'PENDIENTE_CLIENTE']
    })

    guardarFlujos(ajustes, ctx, { estadosOrden: ['EN_PROCESO'] })
    expect(() => modulos.ordenServicioEstado(ctx, {
      id: orden.id, estado: 'FINALIZADA', motivo: 'Fuera de la lista'
    })).toThrow(/no válido/i)
    modulos.ordenServicioEstado(ctx, { id: orden.id, estado: 'ENTREGADA', motivo: 'Entrega legacy' })
    expect((db.prepare('SELECT estado FROM ordenes_servicio WHERE id = ?').get(orden.id) as Fila).estado).toBe('ENTREGADA')
    modulos.ordenServicioEstado(ctx, { id: orden.id, estado: 'ANULADA', motivo: 'Anulación legacy' })
    expect((db.prepare('SELECT estado FROM ordenes_servicio WHERE id = ?').get(orden.id) as Fila).estado).toBe('ANULADA')
    db.close()
  })
})

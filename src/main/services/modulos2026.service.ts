import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { errors } from '@shared/errors'
import { createAjustesService } from './ajustes.service'
import { writeAudit } from '../repositories/auditoria.repo'
import { nextSerieNumber } from '../repositories/configuracion.repo'
import type {
  FiltroModulos, PresupuestoCrear, PresupuestoEjecutar, CambiarEstado,
  ServicioCatalogo, OrdenServicioCrear, ActivoCrear, ActivoDepreciar,
  LeadCrear, LeadEstado, SeguimientoCrear, LeadConvertir
} from './tipos-modulos2026'
import {
  panelHorizontalFiltroSchema,
  type AgendaDatos, type PresupuestoDatos
} from '@shared/schemas/panel-horizontal'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)
const txt = (f: Fila | undefined, k: string): string => String(f?.[k] ?? '')
const redondear = (v: number): number => Math.round(v)

/** Normaliza filtros que llegan sin defaults (llamada directa o IPC sin parse). */
function normFiltro(entrada?: FiltroModulos): {
  estado?: string
  fechaDesde?: string
  fechaHasta?: string
  limite: number
} {
  const f = entrada ?? {}
  return {
    estado: f.estado,
    fechaDesde: f.fechaDesde,
    fechaHasta: f.fechaHasta,
    limite: f.limite ?? 100
  }
}

/**
 * Módulos incorporados en 0.3.0. Toda escritura es transaccional, audita el cambio
 * y vuelve a verificar permisos aunque el router ya los haya comprobado.
 */
export function createModulos2026Service(
  db: Db,
  ajustes: Pick<ReturnType<typeof createAjustesService>, 'leerGrupo'> = createAjustesService(db)
) {
  function exigir(ctx: SessionContext, clave: string): void {
    if (!ctx.permisos.includes(clave)) throw errors.forbidden()
  }

  function auditoria(
    ctx: SessionContext, operacion: string, entidad: string, id: string | number,
    antes: unknown, despues: unknown
  ): void {
    writeAudit(db, ctx, operacion, entidad, id, antes, despues)
  }

  /** Numeración centralizada: una sola reserva atómica, sin implementaciones paralelas. */
  function siguienteNumero(empresaId: number, tipo: string): string {
    try {
      return nextSerieNumber(db, empresaId, tipo)
    } catch {
      throw errors.validation(`No hay serie activa para ${tipo}.`)
    }
  }

  function uno(sql: string, ...args: unknown[]): Fila | undefined {
    return db.prepare(sql).get(...args) as Fila | undefined
  }

  function varios(sql: string, ...args: unknown[]): Fila[] {
    return db.prepare(sql).all(...args) as Fila[]
  }

  // ---------------------------------------------------------------- Presupuestos
  function presupuestos(ctx: SessionContext, entrada?: FiltroModulos): Fila[] {
    exigir(ctx, 'presupuestos.consultar')
    const filtro = normFiltro(entrada)
    const where = ['empresa_id = ?']
    const args: unknown[] = [ctx.empresaId]
    if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
    if (filtro.fechaDesde) { where.push('date(creado_en) >= ?'); args.push(filtro.fechaDesde) }
    if (filtro.fechaHasta) { where.push('date(creado_en) <= ?'); args.push(filtro.fechaHasta) }
    return varios(`SELECT * FROM presupuestos WHERE ${where.join(' AND ')}
      ORDER BY periodo DESC, id DESC LIMIT ?`, ...args, filtro.limite)
  }

  function presupuestoDetalle(ctx: SessionContext, id: number): Record<string, unknown> {
    exigir(ctx, 'presupuestos.consultar')
    const cabecera = uno('SELECT * FROM presupuestos WHERE id = ? AND empresa_id = ?', id, ctx.empresaId)
    if (!cabecera) throw errors.notFound('Presupuesto')
    return {
      cabecera,
      lineas: varios('SELECT * FROM presupuesto_lineas WHERE presupuesto_id = ? AND empresa_id = ? ORDER BY id', id, ctx.empresaId)
    }
  }

  function presupuestoCrear(ctx: SessionContext, input: PresupuestoCrear): Record<string, unknown> {
    exigir(ctx, 'presupuestos.crear')
    let numero = ''
    const id = db.transaction(() => {
      numero = siguienteNumero(ctx.empresaId, 'PRESUPUESTO')
      const total = input.lineas.reduce((acc, l) => acc + l.montoCent, 0)
      const result = db.prepare(`
        INSERT INTO presupuestos
          (empresa_id, numero, nombre, periodo, centro_costo, estado, monto_cent, observaciones, usuario_id)
        VALUES (?, ?, ?, ?, ?, 'BORRADOR', ?, ?, ?)
      `).run(ctx.empresaId, numero, input.nombre, input.periodo ?? new Date().toISOString().slice(0, 7),
        input.centroCosto ?? 'GENERAL', total, input.observaciones ?? '', ctx.userId)
      const presupuestoId = Number(result.lastInsertRowid)
      const addLinea = db.prepare(`
        INSERT INTO presupuesto_lineas (empresa_id, presupuesto_id, categoria, descripcion, monto_cent)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const linea of input.lineas) {
        addLinea.run(ctx.empresaId, presupuestoId, linea.categoria, linea.descripcion, linea.montoCent)
      }
      auditoria(ctx, 'CREAR_PRESUPUESTO', 'presupuestos', presupuestoId, null, { numero, totalCent: total })
      return presupuestoId
    })()
    return { id, numero }
  }

  function cambiarPresupuestoEstado(ctx: SessionContext, input: CambiarEstado): Record<string, unknown> {
    const estados = ['BORRADOR', 'APROBADO', 'CERRADO', 'ANULADO']
    if (!estados.includes(input.estado)) throw errors.validation('Estado de presupuesto no válido.')
    const permiso = input.estado === 'ANULADO'
      ? 'presupuestos.anular'
      : input.estado === 'APROBADO' || input.estado === 'CERRADO'
        ? 'presupuestos.aprobar'
        : 'presupuestos.modificar'
    exigir(ctx, permiso)
    return db.transaction(() => {
      const actual = uno('SELECT * FROM presupuestos WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
      if (!actual) throw errors.notFound('Presupuesto')
      if (['ANULADO', 'CERRADO'].includes(txt(actual, 'estado'))) {
        throw errors.validation('El presupuesto ya está cerrado o anulado.')
      }
      db.prepare('UPDATE presupuestos SET estado = ?, observaciones = ?, actualizado_en = datetime(\'now\') WHERE id = ? AND empresa_id = ?')
        .run(input.estado, input.motivo || txt(actual, 'observaciones'), input.id, ctx.empresaId)
      auditoria(ctx, `PRESUPUESTO_${input.estado}`, 'presupuestos', input.id, { estado: txt(actual, 'estado') }, { estado: input.estado, motivo: input.motivo })
      return { id: input.id, estado: input.estado }
    })()
  }

  function presupuestoEjecutar(ctx: SessionContext, input: PresupuestoEjecutar): Record<string, unknown> {
    exigir(ctx, 'presupuestos.ejecutar')
    return db.transaction(() => {
      const cabecera = uno('SELECT * FROM presupuestos WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
      if (!cabecera) throw errors.notFound('Presupuesto')
      if (txt(cabecera, 'estado') !== 'APROBADO') throw errors.validation('Solo se puede ejecutar un presupuesto aprobado.')
      const disponible = n(cabecera, 'monto_cent') - n(cabecera, 'ejecutado_cent')
      if (input.montoCent > disponible) throw errors.validation('El monto supera el presupuesto disponible.')
      let restante = input.montoCent
      const lineas = varios(`SELECT * FROM presupuesto_lineas
        WHERE presupuesto_id = ? AND empresa_id = ? AND ejecutado_cent < monto_cent ORDER BY id`, input.id, ctx.empresaId)
      const upd = db.prepare('UPDATE presupuesto_lineas SET ejecutado_cent = ejecutado_cent + ? WHERE id = ? AND empresa_id = ?')
      for (const linea of lineas) {
        if (restante <= 0) break
        const hueco = n(linea, 'monto_cent') - n(linea, 'ejecutado_cent')
        const aplicar = Math.min(restante, hueco)
        upd.run(aplicar, n(linea, 'id'), ctx.empresaId)
        restante -= aplicar
      }
      db.prepare(`UPDATE presupuestos SET ejecutado_cent = ejecutado_cent + ?, actualizado_en = datetime('now')
        WHERE id = ? AND empresa_id = ?`).run(input.montoCent, input.id, ctx.empresaId)
      auditoria(ctx, 'EJECUTAR_PRESUPUESTO', 'presupuestos', input.id,
        { ejecutadoCent: n(cabecera, 'ejecutado_cent') },
        { ejecutadoCent: n(cabecera, 'ejecutado_cent') + input.montoCent, descripcion: input.descripcion ?? '' })
      return { id: input.id, ejecutadoCent: n(cabecera, 'ejecutado_cent') + input.montoCent }
    })()
  }

  // ------------------------------------------------------------------- Servicios
  function serviciosCatalogo(ctx: SessionContext): Fila[] {
    exigir(ctx, 'servicios.consultar')
    return varios('SELECT * FROM servicios_catalogo WHERE empresa_id = ? ORDER BY nombre LIMIT 500', ctx.empresaId)
  }

  function servicioCatalogoCrear(ctx: SessionContext, input: ServicioCatalogo): Record<string, unknown> {
    exigir(ctx, 'servicios.crear')
    return db.transaction(() => {
      const existe = uno('SELECT id FROM servicios_catalogo WHERE empresa_id = ? AND codigo = ?', ctx.empresaId, input.codigo)
      if (existe) throw errors.validation('Ya existe un servicio con ese código.')
      const result = db.prepare(`
        INSERT INTO servicios_catalogo (empresa_id, codigo, nombre, descripcion, precio_cent, duracion_min, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.empresaId, input.codigo, input.nombre, input.descripcion ?? '', input.precioCent,
        input.duracionMin ?? 60, input.activo === false ? 0 : 1)
      const id = Number(result.lastInsertRowid)
      auditoria(ctx, 'CREAR_SERVICIO', 'servicios_catalogo', id, null, { codigo: input.codigo, nombre: input.nombre })
      return { id }
    })()
  }

  function ordenesServicio(ctx: SessionContext, entrada?: FiltroModulos): Fila[] {
    exigir(ctx, 'servicios.consultar')
    const filtro = normFiltro(entrada)
    const where = ['empresa_id = ?']
    const args: unknown[] = [ctx.empresaId]
    if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
    if (filtro.fechaDesde) { where.push('date(fecha) >= ?'); args.push(filtro.fechaDesde) }
    if (filtro.fechaHasta) { where.push('date(fecha) <= ?'); args.push(filtro.fechaHasta) }
    return varios(`SELECT * FROM ordenes_servicio WHERE ${where.join(' AND ')}
      ORDER BY fecha DESC, id DESC LIMIT ?`, ...args, filtro.limite)
  }

  function ordenServicioDetalle(ctx: SessionContext, id: number): Record<string, unknown> {
    exigir(ctx, 'servicios.consultar')
    const cabecera = uno('SELECT * FROM ordenes_servicio WHERE id = ? AND empresa_id = ?', id, ctx.empresaId)
    if (!cabecera) throw errors.notFound('Orden de servicio')
    return {
      cabecera,
      lineas: varios('SELECT * FROM orden_servicio_lineas WHERE orden_id = ? AND empresa_id = ? ORDER BY id', id, ctx.empresaId)
    }
  }

  function ordenServicioCrear(ctx: SessionContext, input: OrdenServicioCrear): Record<string, unknown> {
    exigir(ctx, 'servicios.crear')
    const estadoInicial = ajustes.leerGrupo(ctx.empresaId, 'flujos').estadosOrden[0]
    let numero = ''
    const id = db.transaction(() => {
      const cliente = uno('SELECT id, nombre FROM clientes WHERE id = ? AND empresa_id = ? AND activo = 1', input.clienteId, ctx.empresaId)
      if (!cliente) throw errors.validation('El cliente no existe o está inactivo.')
      numero = siguienteNumero(ctx.empresaId, 'ORDEN_SERVICIO')
      let subtotal = 0
      const lineas: { servicioId: number; descripcion: string; cantidad: number; precioCent: number; totalCent: number }[] = []
      for (const linea of input.lineas) {
        const servicio = uno('SELECT * FROM servicios_catalogo WHERE id = ? AND empresa_id = ? AND activo = 1', linea.servicioId, ctx.empresaId)
        if (!servicio) throw errors.validation('Uno de los servicios no existe o está inactivo.')
        const precio = linea.precioCent ?? n(servicio, 'precio_cent')
        const total = redondear(precio * linea.cantidad)
        subtotal += total
        lineas.push({
          servicioId: linea.servicioId,
          descripcion: linea.descripcion || txt(servicio, 'nombre'),
          cantidad: linea.cantidad,
          precioCent: precio,
          totalCent: total
        })
      }
      const impuesto = redondear(subtotal * (input.tasaBp ?? 1800) / 10_000)
      const result = db.prepare(`
        INSERT INTO ordenes_servicio
          (empresa_id, numero, cliente_id, cliente_nombre, tecnico_id, fecha_compromiso, prioridad,
           estado, subtotal_cent, impuesto_cent, total_cent, diagnostico, observaciones, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.empresaId, numero, input.clienteId, txt(cliente, 'nombre'), input.tecnicoId ?? null,
        input.fechaCompromiso ?? '', input.prioridad ?? 'NORMAL', estadoInicial, subtotal, impuesto, subtotal + impuesto,
        input.diagnostico ?? '', input.observaciones ?? '', ctx.userId)
      const ordenId = Number(result.lastInsertRowid)
      const add = db.prepare(`
        INSERT INTO orden_servicio_lineas (empresa_id, orden_id, servicio_id, descripcion, cantidad, precio_cent, total_cent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const linea of lineas) {
        add.run(ctx.empresaId, ordenId, linea.servicioId, linea.descripcion, linea.cantidad, linea.precioCent, linea.totalCent)
      }
      auditoria(ctx, 'CREAR_ORDEN_SERVICIO', 'ordenes_servicio', ordenId, null, {
        numero, estado: estadoInicial, totalCent: subtotal + impuesto
      })
      return ordenId
    })()
    return { id, numero }
  }

  function ordenServicioEstado(ctx: SessionContext, input: CambiarEstado): Record<string, unknown> {
    const flujos = ajustes.leerGrupo(ctx.empresaId, 'flujos')
    // ANULADA y ENTREGADA son terminales legacy: se conservan aunque la empresa
    // configure una lista más corta para no romper operaciones ya existentes.
    const estados = new Set<string>([...flujos.estadosOrden, 'ANULADA', 'ENTREGADA'])
    if (!estados.has(input.estado)) throw errors.validation('Estado de orden no válido.')
    const permiso = ['FINALIZADA', 'ENTREGADA'].includes(input.estado)
      ? 'servicios.finalizar'
      : input.estado === 'ANULADA' ? 'servicios.anular' : 'servicios.modificar'
    exigir(ctx, permiso)
    return db.transaction(() => {
      const actual = uno('SELECT * FROM ordenes_servicio WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
      if (!actual) throw errors.notFound('Orden de servicio')
      if (txt(actual, 'estado') === 'ANULADA') throw errors.validation('La orden está anulada.')
      db.prepare(`UPDATE ordenes_servicio SET estado = ?, observaciones = ?, actualizado_en = datetime('now')
        WHERE id = ? AND empresa_id = ?`).run(input.estado, input.motivo || txt(actual, 'observaciones'), input.id, ctx.empresaId)
      auditoria(ctx, `ORDEN_SERVICIO_${input.estado}`, 'ordenes_servicio', input.id,
        { estado: txt(actual, 'estado') },
        { estado: input.estado, motivo: input.motivo, estadosOrden: flujos.estadosOrden })
      return { id: input.id, estado: input.estado }
    })()
  }

  // --------------------------------------------------------------------- Activos
  function activos(ctx: SessionContext, entrada?: FiltroModulos): Fila[] {
    exigir(ctx, 'activos.consultar')
    const filtro = normFiltro(entrada)
    const where = ['empresa_id = ?']
    const args: unknown[] = [ctx.empresaId]
    if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
    return varios(`SELECT *, (valor_adquisicion_cent - depreciacion_acumulada_cent) AS valor_neto_cent
      FROM activos WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, ...args, filtro.limite)
  }

  function activoCrear(ctx: SessionContext, input: ActivoCrear): Record<string, unknown> {
    exigir(ctx, 'activos.crear')
    if ((input.valorResidualCent ?? 0) > input.valorAdquisicionCent) {
      throw errors.validation('El valor residual no puede superar el valor de adquisición.')
    }
    let numero = ''
    const id = db.transaction(() => {
      numero = siguienteNumero(ctx.empresaId, 'ACTIVO')
      const result = db.prepare(`
        INSERT INTO activos
          (empresa_id, numero, nombre, categoria, codigo_interno, ubicacion, responsable_id,
           fecha_compra, valor_adquisicion_cent, valor_residual_cent, vida_util_meses, observaciones, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.empresaId, numero, input.nombre, input.categoria, input.codigoInterno ?? '', input.ubicacion ?? '',
        input.responsableId ?? null, input.fechaCompra ?? new Date().toISOString().slice(0, 10),
        input.valorAdquisicionCent, input.valorResidualCent ?? 0, input.vidaUtilMeses ?? 60,
        input.observaciones ?? '', ctx.userId)
      const activoId = Number(result.lastInsertRowid)
      auditoria(ctx, 'CREAR_ACTIVO', 'activos', activoId, null, { numero, nombre: input.nombre })
      return activoId
    })()
    return { id, numero }
  }

  function activoDepreciar(ctx: SessionContext, input: ActivoDepreciar): Record<string, unknown> {
    exigir(ctx, 'activos.depreciar')
    return db.transaction(() => {
      const activo = uno('SELECT * FROM activos WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
      if (!activo) throw errors.notFound('Activo')
      if (txt(activo, 'estado') === 'BAJA') throw errors.validation('El activo dado de baja no se deprecia.')
      const duplicado = uno('SELECT id FROM activos_depreciaciones WHERE activo_id = ? AND periodo = ?', input.id, input.periodo)
      if (duplicado) throw errors.validation('Ese período ya fue depreciado.')
      const depreciable = n(activo, 'valor_adquisicion_cent') - n(activo, 'valor_residual_cent')
      const calculado = redondear(depreciable / n(activo, 'vida_util_meses'))
      const monto = input.montoCent ?? calculado
      const acumulada = n(activo, 'depreciacion_acumulada_cent')
      if (monto <= 0 || acumulada + monto > depreciable) {
        throw errors.validation('La depreciación supera el valor depreciable del activo.')
      }
      db.prepare(`INSERT INTO activos_depreciaciones
        (empresa_id, activo_id, periodo, monto_cent, saldo_cent, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?)`).run(ctx.empresaId, input.id, input.periodo, monto, depreciable - acumulada - monto, ctx.userId)
      db.prepare(`UPDATE activos SET depreciacion_acumulada_cent = ?, actualizado_en = datetime('now')
        WHERE id = ? AND empresa_id = ?`).run(acumulada + monto, input.id, ctx.empresaId)
      auditoria(ctx, 'DEPRECIAR_ACTIVO', 'activos', input.id,
        { acumuladaCent: acumulada }, { periodo: input.periodo, montoCent: monto, acumuladaCent: acumulada + monto })
      return { id: input.id, montoCent: monto, acumuladaCent: acumulada + monto }
    })()
  }

  function activoDetalle(ctx: SessionContext, id: number): Record<string, unknown> {
    exigir(ctx, 'activos.consultar')
    const cabecera = uno('SELECT * FROM activos WHERE id = ? AND empresa_id = ?', id, ctx.empresaId)
    if (!cabecera) throw errors.notFound('Activo')
    return {
      cabecera,
      depreciaciones: varios('SELECT * FROM activos_depreciaciones WHERE activo_id = ? AND empresa_id = ? ORDER BY periodo', id, ctx.empresaId)
    }
  }

  function activoBaja(ctx: SessionContext, input: CambiarEstado): Record<string, unknown> {
    exigir(ctx, 'activos.modificar')
    return db.transaction(() => {
      const actual = uno('SELECT * FROM activos WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
      if (!actual) throw errors.notFound('Activo')
      const estado = input.estado === 'ACTIVO' || input.estado === 'EN_REPARACION' ? input.estado : 'BAJA'
      db.prepare(`UPDATE activos SET estado = ?, observaciones = ?, actualizado_en = datetime('now')
        WHERE id = ? AND empresa_id = ?`).run(estado, input.motivo || txt(actual, 'observaciones'), input.id, ctx.empresaId)
      auditoria(ctx, `ACTIVO_${estado}`, 'activos', input.id, { estado: txt(actual, 'estado') }, { estado, motivo: input.motivo })
      return { id: input.id, estado }
    })()
  }

  // ------------------------------------------------------------------------- CRM
  function leads(ctx: SessionContext, entrada?: FiltroModulos): Fila[] {
    exigir(ctx, 'crm.consultar')
    const filtro = normFiltro(entrada)
    const where = ['empresa_id = ?']
    const args: unknown[] = [ctx.empresaId]
    if (filtro.estado) { where.push('estado = ?'); args.push(filtro.estado) }
    if (filtro.fechaDesde) { where.push('date(creado_en) >= ?'); args.push(filtro.fechaDesde) }
    if (filtro.fechaHasta) { where.push('date(creado_en) <= ?'); args.push(filtro.fechaHasta) }
    return varios(`SELECT * FROM crm_leads WHERE ${where.join(' AND ')}
      ORDER BY id DESC LIMIT ?`, ...args, filtro.limite)
  }

  function leadCrear(ctx: SessionContext, input: LeadCrear): Record<string, unknown> {
    exigir(ctx, 'crm.crear')
    let numero = ''
    const id = db.transaction(() => {
      numero = siguienteNumero(ctx.empresaId, 'LEAD')
      const result = db.prepare(`
        INSERT INTO crm_leads
          (empresa_id, numero, nombre, empresa, rnc_cedula, telefono, email, origen, probabilidad,
           valor_estimado_cent, responsable_id, proximo_seguimiento, observaciones, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.empresaId, numero, input.nombre, input.empresa ?? '', input.rncCedula ?? '', input.telefono ?? '',
        input.email ?? '', input.origen ?? 'OTRO', input.probabilidad ?? 10, input.valorEstimadoCent ?? 0,
        input.responsableId ?? null, input.proximoSeguimiento ?? '', input.observaciones ?? '', ctx.userId)
      const leadId = Number(result.lastInsertRowid)
      auditoria(ctx, 'CREAR_LEAD', 'crm_leads', leadId, null, { numero, nombre: input.nombre })
      return leadId
    })()
    return { id, numero }
  }

  function leadEstado(ctx: SessionContext, input: LeadEstado): Record<string, unknown> {
    exigir(ctx, 'crm.modificar')
    return db.transaction(() => {
      const actual = uno('SELECT * FROM crm_leads WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
      if (!actual) throw errors.notFound('Oportunidad')
      const probabilidad = input.probabilidad ?? (input.estado === 'GANADO' ? 100 : input.estado === 'PERDIDO' ? 0 : n(actual, 'probabilidad'))
      db.prepare(`UPDATE crm_leads SET estado = ?, probabilidad = ?, observaciones = ?, actualizado_en = datetime('now')
        WHERE id = ? AND empresa_id = ?`).run(input.estado, probabilidad,
        input.motivo || txt(actual, 'observaciones'), input.id, ctx.empresaId)
      auditoria(ctx, `LEAD_${input.estado}`, 'crm_leads', input.id,
        { estado: txt(actual, 'estado') }, { estado: input.estado, probabilidad })
      return { id: input.id, estado: input.estado, probabilidad }
    })()
  }

  function seguimientoCrear(ctx: SessionContext, input: SeguimientoCrear): Record<string, unknown> {
    exigir(ctx, 'crm.crear')
    return db.transaction(() => {
      const lead = uno('SELECT id FROM crm_leads WHERE id = ? AND empresa_id = ?', input.leadId, ctx.empresaId)
      if (!lead) throw errors.notFound('Oportunidad')
      const result = db.prepare(`
        INSERT INTO crm_seguimientos (empresa_id, lead_id, fecha, tipo, descripcion, usuario_id)
        VALUES (?, ?, date('now'), ?, ?, ?)
      `).run(ctx.empresaId, input.leadId, input.tipo ?? 'LLAMADA', input.descripcion, ctx.userId)
      const id = Number(result.lastInsertRowid)
      db.prepare(`UPDATE crm_leads SET proximo_seguimiento = ?, actualizado_en = datetime('now')
        WHERE id = ? AND empresa_id = ?`).run(input.proximoSeguimiento ?? '', input.leadId, ctx.empresaId)
      auditoria(ctx, 'CREAR_SEGUIMIENTO', 'crm_seguimientos', id, null, { leadId: input.leadId, tipo: input.tipo })
      return { id }
    })()
  }

  function leadConvertir(ctx: SessionContext, input: LeadConvertir): Record<string, unknown> {
    exigir(ctx, 'crm.convertir')
    return db.transaction(() => {
      const lead = uno('SELECT * FROM crm_leads WHERE id = ? AND empresa_id = ?', input.leadId, ctx.empresaId)
      if (!lead) throw errors.notFound('Oportunidad')
      if (lead.cliente_id) throw errors.validation('La oportunidad ya fue convertida en cliente.')
      const codigo = input.codigoCliente || `CLI-${txt(lead, 'numero')}`
      if (uno('SELECT id FROM clientes WHERE empresa_id = ? AND codigo = ?', ctx.empresaId, codigo)) {
        throw errors.validation('Ya existe un cliente con ese código.')
      }
      const result = db.prepare(`
        INSERT INTO clientes
          (empresa_id, codigo, nombre, tipo, rnc_cedula, telefono, email, direccion, observaciones)
        VALUES (?, ?, ?, 'EMPRESA', ?, ?, ?, '', ?)
      `).run(ctx.empresaId, codigo, txt(lead, 'nombre'), txt(lead, 'rnc_cedula'),
        txt(lead, 'telefono'), txt(lead, 'email'), `Convertido desde ${txt(lead, 'numero')}`)
      const clienteId = Number(result.lastInsertRowid)
      db.prepare(`UPDATE crm_leads SET cliente_id = ?, estado = 'GANADO', probabilidad = 100,
        actualizado_en = datetime('now') WHERE id = ? AND empresa_id = ?`)
        .run(clienteId, input.leadId, ctx.empresaId)
      auditoria(ctx, 'CONVERTIR_LEAD', 'crm_leads', input.leadId,
        { clienteId: null }, { clienteId, codigoCliente: codigo })
      return { clienteId, numero: codigo }
    })()
  }

  /** Desviación presupuestaria: cada línea compara ejecución real contra su presupuesto. */
  function presupuestoDesviaciones(
    ctx: SessionContext,
    entrada?: Parameters<typeof panelHorizontalFiltroSchema.parse>[0]
  ): PresupuestoDatos {
    exigir(ctx, 'presupuestos.consultar')
    const filtro = panelHorizontalFiltroSchema.parse(entrada ?? {})
    const umbralPct = Number(ajustes.leerGrupo(ctx.empresaId, 'alertas').presupuestoPct)
    const where = ['l.empresa_id = ?', "p.estado <> 'ANULADO'"]
    const args: unknown[] = [ctx.empresaId]
    if (filtro.texto) {
      where.push('(p.numero LIKE ? OR l.descripcion LIKE ? OR l.categoria LIKE ?)')
      args.push(`%${filtro.texto}%`, `%${filtro.texto}%`, `%${filtro.texto}%`)
    }
    if (filtro.desde) { where.push('p.periodo >= ?'); args.push(filtro.desde) }
    if (filtro.hasta) { where.push('p.periodo <= ?'); args.push(filtro.hasta) }
    args.push(filtro.limite)
    const filas: PresupuestoDatos['filas'] = (db.prepare(`
      SELECT l.presupuesto_id AS presupuestoId, p.numero, l.categoria, l.descripcion,
        l.monto_cent AS montoCent, l.ejecutado_cent AS ejecutadoCent, p.estado
      FROM presupuesto_lineas l
      JOIN presupuestos p ON p.id = l.presupuesto_id AND p.empresa_id = l.empresa_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.periodo DESC, p.numero ASC, l.id ASC LIMIT ?
    `).all(...args) as Fila[]).map((fila) => {
      const montoCent = n(fila, 'montoCent')
      const ejecutadoCent = n(fila, 'ejecutadoCent')
      const pctEjecutado = montoCent > 0 ? Math.round((ejecutadoCent / montoCent) * 100) : 0
      return {
        presupuestoId: n(fila, 'presupuestoId'),
        numero: txt(fila, 'numero'),
        categoria: txt(fila, 'categoria'),
        descripcion: txt(fila, 'descripcion'),
        montoCent,
        ejecutadoCent,
        disponibleCent: Math.max(0, montoCent - ejecutadoCent),
        pctEjecutado,
        nivel: pctEjecutado >= 100 ? 'CRITICO' : pctEjecutado >= umbralPct ? 'ALERTA' : 'NORMAL',
        estado: txt(fila, 'estado')
      }
    })
    const visibles = filtro.soloUrgentes
      ? filas.filter((fila) => fila.nivel !== 'NORMAL')
      : filas
    visibles.sort((a, b) => b.pctEjecutado - a.pctEjecutado)
    return {
      filtro,
      umbralPct,
      resumen: {
        lineas: visibles.length,
        enAlerta: visibles.filter((fila) => fila.nivel !== 'NORMAL').length,
        disponibleCent: visibles.reduce((suma, fila) => suma + fila.disponibleCent, 0)
      },
      filas: visibles.slice(0, filtro.limite)
    }
  }

  /** Agenda operativa de servicios y CRM; cada sección se filtra por permiso real. */
  function agendaOperativa(
    ctx: SessionContext,
    entrada?: Parameters<typeof panelHorizontalFiltroSchema.parse>[0]
  ): AgendaDatos {
    const verServicios = ctx.permisos.includes('servicios.consultar')
    const verCrm = ctx.permisos.includes('crm.consultar')
    if (!verServicios && !verCrm) throw errors.forbidden()
    const filtro = panelHorizontalFiltroSchema.parse(entrada ?? {})
    const hoy = new Date().toISOString().slice(0, 10)
    const ordenes: AgendaDatos['ordenes'] = []
    const leads: AgendaDatos['leads'] = []
    const cargaTecnicoMap = new Map<string, { ordenes: number; minutos: number }>()

    if (verServicios) {
      const where = ["o.estado NOT IN ('ANULADA','FINALIZADA','ENTREGADA')"]
      const args: unknown[] = [ctx.empresaId]
      if (filtro.desde) { where.push('o.fecha_compromiso >= ?'); args.push(filtro.desde) }
      if (filtro.hasta) { where.push('o.fecha_compromiso <= ?'); args.push(filtro.hasta) }
      if (filtro.texto) { where.push('(o.numero LIKE ? OR c.nombre LIKE ?)'); args.push(`%${filtro.texto}%`, `%${filtro.texto}%`) }
      args.push(filtro.limite)
      const filas = db.prepare(`
        SELECT o.id, o.numero, o.fecha_compromiso AS fechaCompromiso, o.estado, o.prioridad,
          c.nombre AS cliente, u.nombre AS tecnico,
          COALESCE(SUM(s.duracion_min * ol.cantidad), 0) AS minutos
        FROM ordenes_servicio o
        LEFT JOIN clientes c ON c.id = o.cliente_id AND c.empresa_id = o.empresa_id
        LEFT JOIN usuarios u ON u.id = o.tecnico_id
        LEFT JOIN orden_servicio_lineas ol ON ol.orden_id = o.id AND ol.empresa_id = o.empresa_id
        LEFT JOIN servicios_catalogo s ON s.id = ol.servicio_id AND s.empresa_id = o.empresa_id
        WHERE o.empresa_id = ? AND ${where.join(' AND ')}
        GROUP BY o.id ORDER BY o.fecha_compromiso ASC LIMIT ?
      `).all(...args) as Fila[]
      for (const fila of filas) {
        const fechaCompromiso = txt(fila, 'fechaCompromiso')
        const vencida = Boolean(fechaCompromiso && fechaCompromiso < hoy)
        if (filtro.soloUrgentes && !vencida && fechaCompromiso !== hoy) continue
        const tecnico = txt(fila, 'tecnico') || 'SIN_ASIGNAR'
        const minutos = n(fila, 'minutos')
        const carga = cargaTecnicoMap.get(tecnico) ?? { ordenes: 0, minutos: 0 }
        carga.ordenes += 1
        carga.minutos += minutos
        cargaTecnicoMap.set(tecnico, carga)
        ordenes.push({
          id: n(fila, 'id'),
          numero: txt(fila, 'numero'),
          cliente: txt(fila, 'cliente'),
          fechaCompromiso,
          estado: txt(fila, 'estado'),
          prioridad: txt(fila, 'prioridad'),
          tecnico,
          minutos,
          vencida
        })
      }
    }

    if (verCrm) {
      const where = ["l.estado NOT IN ('GANADO','PERDIDO')"]
      const args: unknown[] = [ctx.empresaId]
      if (filtro.texto) { where.push('(l.numero LIKE ? OR l.nombre LIKE ?)'); args.push(`%${filtro.texto}%`, `%${filtro.texto}%`) }
      args.push(filtro.limite)
      const filas = db.prepare(`
        SELECT l.id, l.numero, l.nombre, l.empresa, l.estado, l.probabilidad,
          l.valor_estimado_cent AS valorEstimadoCent, l.proximo_seguimiento AS proximoSeguimiento,
          (SELECT MAX(s.fecha) FROM crm_seguimientos s
            WHERE s.lead_id = l.id AND s.empresa_id = l.empresa_id) AS ultimoContacto
        FROM crm_leads l
        WHERE l.empresa_id = ? AND ${where.join(' AND ')}
        ORDER BY l.proximo_seguimiento ASC, l.id DESC LIMIT ?
      `).all(...args) as Fila[]
      for (const fila of filas) {
        const proximoSeguimiento = txt(fila, 'proximoSeguimiento')
        const vencido = Boolean(proximoSeguimiento && proximoSeguimiento.slice(0, 10) < hoy)
        if (filtro.soloUrgentes && !vencido) continue
        leads.push({
          id: n(fila, 'id'),
          nombre: `${txt(fila, 'numero')} · ${txt(fila, 'nombre')}`,
          empresa: txt(fila, 'empresa'),
          estado: txt(fila, 'estado'),
          probabilidad: n(fila, 'probabilidad'),
          valorEstimadoCent: n(fila, 'valorEstimadoCent'),
          proximoSeguimiento,
          ultimoContacto: txt(fila, 'ultimoContacto'),
          vencido
        })
      }
    }

    return {
      filtro,
      secciones: { servicios: verServicios, crm: verCrm },
      resumen: {
        ordenesVencidas: ordenes.filter((fila) => fila.vencida).length,
        ordenesHoy: ordenes.filter((fila) => fila.fechaCompromiso === hoy).length,
        leadsVencidos: leads.filter((fila) => fila.vencido).length,
        minutos: ordenes.reduce((suma, fila) => suma + fila.minutos, 0)
      },
      ordenes: ordenes.slice(0, filtro.limite),
      leads: leads.slice(0, filtro.limite),
      cargaTecnico: [...cargaTecnicoMap.entries()]
        .map(([tecnico, carga]) => ({ tecnico, ...carga }))
        .sort((a, b) => b.minutos - a.minutos)
        .slice(0, filtro.limite)
    }
  }

  return {
    presupuestos, presupuestoDetalle, presupuestoCrear, cambiarPresupuestoEstado, presupuestoEjecutar,
    presupuestoDesviaciones,
    serviciosCatalogo, servicioCatalogoCrear, ordenesServicio, ordenServicioDetalle,
    ordenServicioCrear, ordenServicioEstado, agendaOperativa,
    activos, activoDetalle, activoCrear, activoDepreciar, activoBaja,
    leads, leadCrear, leadEstado, seguimientoCrear, leadConvertir
  }
}

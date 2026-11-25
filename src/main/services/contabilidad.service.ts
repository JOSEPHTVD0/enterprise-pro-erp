import type { z } from 'zod'
import { errors } from '@shared/errors'
import {
  asientoCrearSchema, asientoEstadoSchema, cuentaCrearSchema, cuentaEstadoSchema,
  cuentaModificarSchema, filtroContabilidadSchema, integrarSchema, mayorSchema,
  periodoAbrirSchema, periodoCerrarSchema
} from '@shared/schemas/contabilidad'
import type { Db } from '../db/connection'
import * as repo from '../repositories/contabilidad.repo'
import { writeAudit } from '../repositories/auditoria.repo'
import { requirePermission } from './context'
import type { SessionContext } from './context'

/** Servicio de contabilidad. Los importes viajan y se almacenan en centavos enteros. */

type Fila = Record<string, unknown>
const n = repo.n
const txt = repo.txt

type Filtro = z.input<typeof filtroContabilidadSchema>
type CuentaCrear = z.input<typeof cuentaCrearSchema>
type CuentaModificar = z.input<typeof cuentaModificarSchema>
type CuentaEstado = z.input<typeof cuentaEstadoSchema>
type PeriodoAbrir = z.input<typeof periodoAbrirSchema>
type PeriodoCerrar = z.input<typeof periodoCerrarSchema>
type AsientoCrear = z.input<typeof asientoCrearSchema>
type AsientoEstado = z.input<typeof asientoEstadoSchema>
type Mayor = z.input<typeof mayorSchema>
type Integrar = z.input<typeof integrarSchema>

/** Saldo con signo según la naturaleza de la cuenta. */
function saldo(f: Fila): number {
  const debe = n(f, 'debe_cent') || n(f, 'debe_centavos')
  const haber = n(f, 'haber_cent') || n(f, 'haber_centavos')
  return txt(f, 'naturaleza') === 'ACREEDORA' ? haber - debe : debe - haber
}

export function createContabilidadService(db: Db) {
  function exigir(ctx: SessionContext, operacion: string): void {
    requirePermission(ctx, `contabilidad.${operacion}`)
  }

  function auditoria(
    ctx: SessionContext, operacion: string, entidad: string, id: string | number,
    antes: unknown = null, despues: unknown = null
  ): void {
    writeAudit(db, ctx, operacion, entidad, id, antes, despues)
  }

  function cuentaMovible(ctx: SessionContext, cuentaId: number): Fila {
    const cuenta = repo.obtenerCuenta(db, ctx.empresaId, cuentaId)
    if (!cuenta) throw errors.validation(`La cuenta ${cuentaId} no existe.`)
    if (!n(cuenta, 'activa')) throw errors.validation(`La cuenta ${txt(cuenta, 'codigo')} está inactiva.`)
    if (!n(cuenta, 'acepta_movimiento')) {
      throw errors.validation(`La cuenta ${txt(cuenta, 'codigo')} no acepta movimientos.`)
    }
    return cuenta
  }

  function verificarBalance(lineas: { debeCent: number; haberCent: number }[]): void {
    const debe = lineas.reduce((acc, linea) => acc + linea.debeCent, 0)
    const haber = lineas.reduce((acc, linea) => acc + linea.haberCent, 0)
    if (debe <= 0 || debe !== haber) {
      throw errors.validation('El asiento está descuadrado: el debe y el haber deben ser iguales y mayores que cero.')
    }
  }

  // ------------------------------------------------------------------ Cuentas
  function cuentas(ctx: SessionContext, entrada?: Filtro): Fila[] {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    return repo.listarCuentas(db, ctx.empresaId, {
      estado: filtro.estado,
      limite: filtro.limite
    })
  }

  function cuentaCrear(ctx: SessionContext, entrada: CuentaCrear): Record<string, unknown> {
    exigir(ctx, 'crear')
    const input = cuentaCrearSchema.parse(entrada)
    return db.transaction(() => {
      if (repo.obtenerCuentaPorCodigo(db, ctx.empresaId, input.codigo)) {
        throw errors.validation('Ya existe una cuenta con ese código.')
      }
      let nivel = 1
      if (input.padreId !== undefined) {
        const padre = repo.obtenerCuenta(db, ctx.empresaId, input.padreId)
        if (!padre) throw errors.validation('La cuenta padre no existe.')
        nivel = n(padre, 'nivel') + 1
      }
      const id = repo.insertarCuenta(db, ctx.empresaId, {
        codigo: input.codigo,
        nombre: input.nombre,
        tipo: input.tipo,
        naturaleza: input.naturaleza,
        padreId: input.padreId ?? null,
        nivel,
        aceptaMovimiento: input.aceptaMovimiento
      })
      auditoria(ctx, 'CREAR_CUENTA', 'plan_cuentas', id, null,
        { codigo: input.codigo, nombre: input.nombre, nivel })
      return { id, codigo: input.codigo, nivel }
    })()
  }

  function cuentaModificar(ctx: SessionContext, entrada: CuentaModificar): Record<string, unknown> {
    exigir(ctx, 'modificar')
    const input = cuentaModificarSchema.parse(entrada)
    return db.transaction(() => {
      const actual = repo.obtenerCuenta(db, ctx.empresaId, input.id)
      if (!actual) throw errors.notFound('Cuenta contable')
      repo.actualizarCuenta(db, ctx.empresaId, input)
      auditoria(ctx, 'MODIFICAR_CUENTA', 'plan_cuentas', input.id,
        { nombre: txt(actual, 'nombre'), activa: n(actual, 'activa') },
        { nombre: input.nombre, aceptaMovimiento: input.aceptaMovimiento, activa: input.activa })
      return { id: input.id }
    })()
  }

  function cuentaEstado(ctx: SessionContext, entrada: CuentaEstado): Record<string, unknown> {
    exigir(ctx, 'modificar')
    const input = cuentaEstadoSchema.parse(entrada)
    return db.transaction(() => {
      const actual = repo.obtenerCuenta(db, ctx.empresaId, input.id)
      if (!actual) throw errors.notFound('Cuenta contable')
      repo.actualizarEstadoCuenta(db, ctx.empresaId, input.id, input.activa)
      auditoria(ctx, input.activa ? 'ACTIVAR_CUENTA' : 'DESACTIVAR_CUENTA', 'plan_cuentas', input.id,
        { activa: n(actual, 'activa') }, { activa: input.activa ? 1 : 0 })
      return { id: input.id, activa: input.activa }
    })()
  }

  // ----------------------------------------------------------------- Periodos
  function periodos(ctx: SessionContext, entrada?: Filtro): Fila[] {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    return repo.listarPeriodos(db, ctx.empresaId, {
      estado: filtro.estado,
      limite: filtro.limite
    })
  }

  function periodoAbrir(ctx: SessionContext, entrada: PeriodoAbrir): Record<string, unknown> {
    exigir(ctx, 'crear')
    const input = periodoAbrirSchema.parse(entrada)
    return db.transaction(() => {
      const existente = repo.obtenerPeriodoPorAnioMes(db, ctx.empresaId, input.anio, input.mes)
      if (existente) {
        if (txt(existente, 'estado') === 'CERRADO') {
          throw errors.validation('El período ya está cerrado y no se puede reabrir.')
        }
        return { id: n(existente, 'id'), estado: 'ABIERTO', anio: input.anio, mes: input.mes }
      }
      const id = repo.crearPeriodoSiFalta(db, ctx.empresaId, input.anio, input.mes)
      auditoria(ctx, 'ABRIR_PERIODO', 'periodos_contables', id, null,
        { anio: input.anio, mes: input.mes, estado: 'ABIERTO' })
      return { id, estado: 'ABIERTO', anio: input.anio, mes: input.mes }
    })()
  }

  function periodoCerrar(ctx: SessionContext, entrada: PeriodoCerrar): Record<string, unknown> {
    requirePermission(ctx, 'contabilidad.periodo.cerrar')
    const input = periodoCerrarSchema.parse(entrada)
    return db.transaction(() => {
      const actual = repo.obtenerPeriodo(db, ctx.empresaId, input.id)
      if (!actual) throw errors.notFound('Período contable')
      if (txt(actual, 'estado') === 'CERRADO') throw errors.validation('El período ya está cerrado.')
      if (repo.contarBorradoresEnPeriodo(db, ctx.empresaId, input.id) > 0) {
        throw errors.validation('No se puede cerrar el período mientras haya asientos en borrador.')
      }
      repo.cerrarPeriodo(db, ctx.empresaId, input.id)
      auditoria(ctx, 'CERRAR_PERIODO', 'periodos_contables', input.id,
        { estado: txt(actual, 'estado') }, { estado: 'CERRADO' })
      return { id: input.id, estado: 'CERRADO' }
    })()
  }

  // ----------------------------------------------------------------- Asientos
  function asientos(ctx: SessionContext, entrada?: Filtro): Fila[] {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    return repo.listarAsientos(db, ctx.empresaId, filtro)
  }

  function asientoCrear(ctx: SessionContext, entrada: AsientoCrear): Record<string, unknown> {
    exigir(ctx, 'crear')
    const input = asientoCrearSchema.parse(entrada)
    verificarBalance(input.lineas)
    for (const linea of input.lineas) cuentaMovible(ctx, linea.cuentaId)
    const periodo = repo.periodoParaFecha(db, ctx.empresaId, input.fecha)
    if (!periodo || txt(periodo, 'estado') !== 'ABIERTO') {
      throw errors.validation('No hay un período contable abierto para la fecha del asiento.')
    }

    const creado = db.transaction(() => {
      const resultado = repo.insertarAsiento(db, ctx.empresaId, {
        fecha: input.fecha,
        descripcion: input.descripcion,
        tipo: input.tipo,
        periodoId: n(periodo, 'id'),
        usuarioId: ctx.userId
      })
      repo.insertarLineas(db, resultado.id, input.lineas.map((linea) => ({
        cuentaId: linea.cuentaId,
        debeCent: linea.debeCent,
        haberCent: linea.haberCent,
        descripcion: linea.descripcion
      })))
      auditoria(ctx, 'CREAR_ASIENTO', 'asientos', resultado.id, null,
        { numero: resultado.numero, fecha: input.fecha, tipo: input.tipo, debeCent: input.lineas.reduce((a, l) => a + l.debeCent, 0) })
      return resultado
    })()
    return { id: creado.id, numero: creado.numero, estado: 'BORRADOR' }
  }

  function asientoConfirmar(ctx: SessionContext, entrada: AsientoEstado): Record<string, unknown> {
    requirePermission(ctx, 'contabilidad.asiento.confirmar')
    const input = asientoEstadoSchema.parse(entrada)
    if (input.estado !== 'CONFIRMAR') throw errors.validation('Estado no válido para confirmar el asiento.')
    return db.transaction(() => {
      const actual = repo.obtenerAsiento(db, ctx.empresaId, input.id)
      if (!actual) throw errors.notFound('Asiento contable')
      if (txt(actual, 'estado') === 'ANULADO') throw errors.validation('El asiento está anulado.')
      if (txt(actual, 'estado') === 'CONFIRMADO') throw errors.validation('El asiento ya está confirmado.')
      const sumas = repo.sumasLineas(db, input.id)
      if (sumas.debeCent <= 0 || sumas.debeCent !== sumas.haberCent) {
        throw errors.validation('El asiento está descuadrado y no se puede confirmar.')
      }
      repo.actualizarEstadoAsiento(db, ctx.empresaId, input.id, 'CONFIRMADO')
      auditoria(ctx, 'CONFIRMAR_ASIENTO', 'asientos', input.id,
        { estado: txt(actual, 'estado') }, { estado: 'CONFIRMADO', debeCent: sumas.debeCent })
      return { id: input.id, estado: 'CONFIRMADO' }
    })()
  }

  function asientoAnular(ctx: SessionContext, entrada: AsientoEstado): Record<string, unknown> {
    exigir(ctx, 'anular')
    const input = asientoEstadoSchema.parse(entrada)
    if (input.estado !== 'ANULAR') throw errors.validation('Estado no válido para anular el asiento.')
    return db.transaction(() => {
      const actual = repo.obtenerAsiento(db, ctx.empresaId, input.id)
      if (!actual) throw errors.notFound('Asiento contable')
      if (txt(actual, 'estado') === 'ANULADO') throw errors.validation('El asiento ya está anulado.')
      repo.actualizarEstadoAsiento(db, ctx.empresaId, input.id, 'ANULADO')
      auditoria(ctx, 'ANULAR_ASIENTO', 'asientos', input.id,
        { estado: txt(actual, 'estado') }, { estado: 'ANULADO' })
      return { id: input.id, estado: 'ANULADO' }
    })()
  }

  // ----------------------------------------------------------------- Reportes
  function libroDiario(ctx: SessionContext, entrada?: Filtro): Fila[] {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    return repo.lineasParaReporte(db, ctx.empresaId, {
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta,
      limite: filtro.limite
    }).map((f) => ({
      asientoId: n(f, 'asiento_id'),
      numero: txt(f, 'numero'),
      fecha: txt(f, 'fecha'),
      estado: txt(f, 'estado'),
      asientoDescripcion: txt(f, 'asiento_descripcion'),
      cuentaId: n(f, 'cuenta_id'),
      codigo: txt(f, 'codigo'),
      cuenta: txt(f, 'cuenta_nombre'),
      lineaDescripcion: txt(f, 'linea_descripcion'),
      debeCent: n(f, 'debe_centavos'),
      haberCent: n(f, 'haber_centavos')
    }))
  }

  function mayor(ctx: SessionContext, entrada: Mayor): Fila[] {
    exigir(ctx, 'consultar')
    const input = mayorSchema.parse(entrada)
    const cuenta = repo.obtenerCuenta(db, ctx.empresaId, input.cuentaId)
    if (!cuenta) throw errors.notFound('Cuenta contable')
    let acumulado = 0
    return repo.lineasParaReporte(db, ctx.empresaId, {
      cuentaId: input.cuentaId,
      fechaDesde: input.fechaDesde,
      fechaHasta: input.fechaHasta,
      limite: 1000
    }).map((f) => {
      acumulado += saldo(f)
      return {
        cuentaId: input.cuentaId,
        codigo: txt(cuenta, 'codigo'),
        cuenta: txt(cuenta, 'nombre'),
        naturaleza: txt(cuenta, 'naturaleza'),
        asientoId: n(f, 'asiento_id'),
        numero: txt(f, 'numero'),
        fecha: txt(f, 'fecha'),
        descripcion: txt(f, 'asiento_descripcion'),
        debeCent: n(f, 'debe_centavos'),
        haberCent: n(f, 'haber_centavos'),
        saldoCent: acumulado
      }
    })
  }

  function balanceComprobacion(ctx: SessionContext, entrada?: Filtro): Fila[] {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    return repo.resumenContable(db, ctx.empresaId, {
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta
    }).map((f) => {
      const saldoCent = saldo(f)
      return {
        cuentaId: n(f, 'cuenta_id'),
        codigo: txt(f, 'codigo'),
        nombre: txt(f, 'nombre'),
        tipo: txt(f, 'tipo'),
        naturaleza: txt(f, 'naturaleza'),
        debeCent: n(f, 'debe_cent'),
        haberCent: n(f, 'haber_cent'),
        saldoDeudorCent: saldoCent > 0 ? saldoCent : 0,
        saldoAcreedorCent: saldoCent < 0 ? -saldoCent : 0
      }
    })
  }

  function estadoResultados(ctx: SessionContext, entrada?: Filtro): Record<string, unknown> {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    const filas = repo.resumenContable(db, ctx.empresaId, {
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta
    })
    let ingresosCent = 0
    let gastosCent = 0
    const detalle: Fila[] = []
    for (const fila of filas) {
      const tipo = txt(fila, 'tipo')
      if (tipo !== 'INGRESO' && tipo !== 'GASTO') continue
      const saldoCent = saldo(fila)
      if (tipo === 'INGRESO') ingresosCent += saldoCent
      else gastosCent += saldoCent
      detalle.push({
        cuentaId: n(fila, 'cuenta_id'),
        codigo: txt(fila, 'codigo'),
        nombre: txt(fila, 'nombre'),
        tipo,
        debeCent: n(fila, 'debe_cent'),
        haberCent: n(fila, 'haber_cent'),
        saldoCent
      })
    }
    return { ingresosCent, gastosCent, resultadoCent: ingresosCent - gastosCent, detalle }
  }

  function balanceGeneral(ctx: SessionContext, entrada?: Filtro): Record<string, unknown> {
    exigir(ctx, 'consultar')
    const filtro = filtroContabilidadSchema.parse(entrada ?? {})
    const filas = repo.resumenContable(db, ctx.empresaId, {
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta
    })
    let activoCent = 0
    let pasivoCent = 0
    let patrimonioCent = 0
    let resultadoCent = 0
    const detalle: Fila[] = []
    for (const fila of filas) {
      const tipo = txt(fila, 'tipo')
      const saldoCent = saldo(fila)
      if (tipo === 'ACTIVO') activoCent += saldoCent
      else if (tipo === 'PASIVO') pasivoCent += saldoCent
      else if (tipo === 'PATRIMONIO') patrimonioCent += saldoCent
      else if (tipo === 'INGRESO') resultadoCent += saldoCent
      else if (tipo === 'GASTO') resultadoCent -= saldoCent
      detalle.push({
        cuentaId: n(fila, 'cuenta_id'),
        codigo: txt(fila, 'codigo'),
        nombre: txt(fila, 'nombre'),
        tipo,
        naturaleza: txt(fila, 'naturaleza'),
        debeCent: n(fila, 'debe_cent'),
        haberCent: n(fila, 'haber_cent'),
        saldoCent
      })
    }
    return {
      activoCent,
      pasivoCent,
      patrimonioCent,
      resultadoCent,
      pasivoMasPatrimonioCent: pasivoCent + patrimonioCent + resultadoCent,
      detalle
    }
  }

  // -------------------------------------------------------------- Integración
  /** Integra ventas confirmadas pendientes; cada documento genera un asiento VENTA en borrador. */
  function integrarDocumentos(ctx: SessionContext, entrada?: Integrar): Record<string, unknown> {
    requirePermission(ctx, 'contabilidad.crear')
    requirePermission(ctx, 'contabilidad.integrar')
    const filtro = integrarSchema.parse(entrada ?? {})
    return db.transaction(() => {
      const documentos = repo.documentosVentaParaIntegrar(db, ctx.empresaId, filtro)
      const ids: number[] = []
      for (const documento of documentos) {
        const fecha = txt(documento, 'fecha').slice(0, 10)
        const anio = Number(fecha.slice(0, 4))
        const mes = Number(fecha.slice(5, 7))
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || anio < 2000 || anio > 2100 || mes < 1 || mes > 12) continue
        const periodoId = repo.crearPeriodoSiFalta(db, ctx.empresaId, anio, mes)
        const periodo = repo.obtenerPeriodo(db, ctx.empresaId, periodoId)
        if (!periodo || txt(periodo, 'estado') !== 'ABIERTO') continue

        const codigoCobro = n(documento, 'pago_efectivo') === 1 ? '1110' : '1130'
        const cobro = repo.obtenerCuentaPorCodigo(db, ctx.empresaId, codigoCobro)
        const ventas = repo.obtenerCuentaPorCodigo(db, ctx.empresaId, '4100')
        const itbis = repo.obtenerCuentaPorCodigo(db, ctx.empresaId, '4110')
        if (!cobro || !ventas || !itbis) {
          throw errors.validation('El plan de cuentas base no tiene las cuentas necesarias para integrar ventas.')
        }

        const totalCent = n(documento, 'total_cent')
        const impuestoCent = n(documento, 'impuesto_cent')
        const subtotalCent = totalCent - impuestoCent
        const numero = txt(documento, 'numero')
        const descripcion = `Venta ${numero} - ${txt(documento, 'cliente_nombre')}`.slice(0, 200)
        const creado = repo.insertarAsiento(db, ctx.empresaId, {
          fecha, descripcion, tipo: 'VENTA', periodoId, usuarioId: ctx.userId
        })
        repo.insertarLineas(db, creado.id, [
          { cuentaId: n(cobro, 'id'), debeCent: totalCent, haberCent: 0, descripcion: `Documento ${numero}` },
          { cuentaId: n(ventas, 'id'), debeCent: 0, haberCent: subtotalCent, descripcion: 'Subtotal de venta' },
          { cuentaId: n(itbis, 'id'), debeCent: 0, haberCent: impuestoCent, descripcion: 'ITBIS de venta' }
        ])
        auditoria(ctx, 'INTEGRAR_VENTA', 'asientos', creado.id, null,
          { documentoId: n(documento, 'id'), numero, totalCent, asiento: creado.numero })
        ids.push(creado.id)
      }
      return { asientosCreados: ids.length, documentos: documentos.length, ids }
    })()
  }

  return {
    cuentas, cuentaCrear, cuentaModificar, cuentaEstado,
    periodos, periodoAbrir, periodoCerrar,
    asientos, asientoCrear, asientoConfirmar, asientoAnular,
    libroDiario, mayor, balanceComprobacion, estadoResultados, balanceGeneral,
    integrarDocumentos
  }
}

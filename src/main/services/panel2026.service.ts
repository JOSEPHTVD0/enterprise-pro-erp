import type { Db } from '../db/connection'
import { requirePermission, type SessionContext } from './context'
import { createAjustesService } from './ajustes.service'
import { panel2026FiltroSchema, type Panel2026Filtro } from '@shared/schemas/paneles'
import type { Settings } from '@shared/settings'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)
const txt = (f: Fila | undefined, k: string): string => String(f?.[k] ?? '')
const clamp = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

function fechaISO(d: Date): string { return d.toISOString().slice(0, 10) }

function rango(periodo: Panel2026Filtro['periodo']): { desde: string; hasta: string } {
  const hasta = fechaISO(new Date())
  if (periodo === 'MES') return { desde: `${hasta.slice(0, 7)}-01`, hasta }
  if (periodo === 'TRIMESTRE') {
    const d = new Date(`${hasta}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 2)
    d.setUTCDate(1)
    return { desde: fechaISO(d), hasta }
  }
  return { desde: `${hasta.slice(0, 4)}-01-01`, hasta }
}

function rangoAnterior(
  periodo: Panel2026Filtro['periodo'], desde: string, hasta: string
): { desde: string; hasta: string } {
  const inicio = new Date(`${desde}T00:00:00Z`).getTime()
  const fin = new Date(`${hasta}T00:00:00Z`).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return { desde, hasta }
  const dias = Math.max(1, Math.round((fin - inicio) / 86_400_000) + 1)
  const anteriorFin = new Date(inicio)
  anteriorFin.setUTCDate(anteriorFin.getUTCDate() - 1)
  const anteriorInicio = new Date(anteriorFin.getTime())
  anteriorInicio.setUTCDate(anteriorInicio.getUTCDate() - dias + 1)
  // El periodo ANIO siempre empieza el 1 de enero: el anterior es el año completo previo.
  if (periodo === 'ANIO') {
    return {
      desde: `${Number(hasta.slice(0, 4)) - 1}-01-01`,
      hasta: `${Number(hasta.slice(0, 4)) - 1}-12-31`
    }
  }
  return { desde: fechaISO(anteriorInicio), hasta: fechaISO(anteriorFin) }
}

type Senal = { nivel: 'Info' | 'Medio' | 'Alto'; texto: string }

/**
 * Panel 2026: indicadores operativos, financieros y de riesgo calculados en el
 * proceso principal. Solo lectura, SQL parametrizado y sin datos simulados.
 */
export function createPanel2026Service(
  db: Db,
  ajustes: ReturnType<typeof createAjustesService>,
  cargar: () => Settings
) {
  function consultar(sql: string, ...args: unknown[]): Fila[] {
    return db.prepare(sql).all(...args) as Fila[]
  }

  function uno(sql: string, ...args: unknown[]): Fila | undefined {
    return db.prepare(sql).get(...args) as Fila | undefined
  }

  function resumen(ctx: SessionContext, entrada: Panel2026Filtro) {
    requirePermission(ctx, 'inteligencia.consultar')
    const empresaId = ctx.empresaId
    const panel2026 = ajustes.leerGrupo(empresaId, 'panel2026')
    const crudo = entrada && typeof entrada === 'object' ? entrada as Record<string, unknown> : {}
    const filtro = panel2026FiltroSchema.parse({
      vista: panel2026.vista,
      metricaPrincipal: panel2026.metricaPrincipal,
      ...crudo
    })
    const { desde, hasta } = rango(filtro.periodo)
    const alertas = ajustes.leerGrupo(empresaId, 'alertas')
    const widgets = ajustes.leerGrupo(empresaId, 'widgets')
    const rendimiento = ajustes.leerGrupo(empresaId, 'rendimiento')
    const settings = cargar().panel
    const filas = clamp(Math.min(panel2026.filas, widgets.filas, rendimiento.limiteFilas), 3, 50)
    const dias = panel2026.diasProyeccion
    const umbralStock = panel2026.umbralStockBajo
    const umbralCxc = panel2026.umbralCxcDias

    const ventaTipos = `'FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO'`
    const signoVenta = `CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END`
    const compraTipos = `'FACTURA_COMPRA','DEVOLUCION_COMPRA'`
    const signoCompra = `CASE WHEN tipo = 'DEVOLUCION_COMPRA' THEN -total_cent ELSE total_cent END`

    const ventas = uno(`SELECT COALESCE(SUM(${signoVenta}),0) AS total
      FROM documentos_venta WHERE empresa_id = ? AND tipo IN (${ventaTipos})
        AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
    const compras = uno(`SELECT COALESCE(SUM(${signoCompra}),0) AS total
      FROM documentos_compra WHERE empresa_id = ? AND tipo IN (${compraTipos})
        AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
    const cobros = uno(`SELECT COALESCE(SUM(monto_cent),0) AS total FROM cxc_recibos
      WHERE empresa_id = ? AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
    const pagos = uno(`SELECT COALESCE(SUM(monto_cent),0) AS total FROM cxp_pagos
      WHERE empresa_id = ? AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
    const cxc = uno(`SELECT COALESCE(SUM(saldo_cent),0) AS total FROM cxc_documentos
      WHERE empresa_id = ? AND estado <> 'ANULADO'`, empresaId)
    const cxp = uno(`SELECT COALESCE(SUM(saldo_cent),0) AS total FROM cxp_documentos
      WHERE empresa_id = ? AND estado <> 'ANULADO'`, empresaId)
    const diag = uno(`SELECT
        (SELECT COUNT(*) FROM existencias WHERE empresa_id = ? AND cantidad <= 0) AS sinStock,
        (SELECT COUNT(*) FROM existencias WHERE empresa_id = ? AND cantidad > 0 AND cantidad < ?) AS stockBajo,
        (SELECT COUNT(*) FROM cxc_documentos WHERE empresa_id = ? AND estado = 'PENDIENTE'
          AND saldo_cent > 0 AND date(COALESCE(NULLIF(vencimiento,''), fecha)) < date('now')) AS cxcVencido`,
      empresaId, empresaId, umbralStock, empresaId)!

    const conUtilidad = ctx.permisos.includes('reportes.ganancia') && settings.verUtilidad
    const ganancia = conUtilidad
      ? uno(`SELECT COALESCE(SUM(total_cent - costo_total_cent),0) AS total
        FROM documentos_venta WHERE empresa_id = ? AND tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS')
          AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
      : undefined
    const ventasCent = n(ventas, 'total')
    const utilidadCent = conUtilidad ? n(ganancia, 'total') : null

    const kpis = {
      ventasCent,
      comprasCent: n(compras, 'total'),
      cobrosCent: n(cobros, 'total'),
      pagosCent: n(pagos, 'total'),
      cxcSaldoCent: n(cxc, 'total'),
      cxpSaldoCent: n(cxp, 'total'),
      cxcVencido: n(diag, 'cxcVencido'),
      sinStock: n(diag, 'sinStock'),
      stockBajo: n(diag, 'stockBajo'),
      utilidadCent,
      margenBp: utilidadCent === null || ventasCent <= 0 ? null : Math.round((utilidadCent / ventasCent) * 10_000)
    }

    const anterior = rangoAnterior(filtro.periodo, desde, hasta)
    const comparar = (actualCent: number, anteriorCent: number) => ({
      actualCent,
      anteriorCent,
      deltaCent: actualCent - anteriorCent,
      deltaPct: anteriorCent === 0 ? null : Math.round(((actualCent - anteriorCent) / anteriorCent) * 10_000) / 100
    })
    const comparacion = panel2026.compararPeriodo ? {
      desde: anterior.desde,
      hasta: anterior.hasta,
      ventas: comparar(kpis.ventasCent, n(uno(`SELECT COALESCE(SUM(${signoVenta}),0) AS total
        FROM documentos_venta WHERE empresa_id = ? AND tipo IN (${ventaTipos})
          AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, anterior.desde, anterior.hasta), 'total')),
      cobros: comparar(kpis.cobrosCent, n(uno(`SELECT COALESCE(SUM(monto_cent),0) AS total
        FROM cxc_recibos WHERE empresa_id = ? AND estado <> 'ANULADO'
          AND date(fecha) BETWEEN ? AND ?`, empresaId, anterior.desde, anterior.hasta), 'total'))
    } : null

    // Tendencia mensual de los últimos 12 meses, con ventas y compras reales.
    const ventasMes = consultar(`
      SELECT substr(fecha, 1, 7) AS clave, SUM(${signoVenta}) AS montoCent
      FROM documentos_venta
      WHERE empresa_id = ? AND tipo IN (${ventaTipos}) AND estado <> 'ANULADO'
        AND date(fecha) >= date(?, 'start of month', '-11 months') AND date(fecha) <= ?
      GROUP BY substr(fecha, 1, 7)`, empresaId, hasta, hasta)
    const comprasMes = consultar(`
      SELECT substr(fecha, 1, 7) AS clave, SUM(${signoCompra}) AS montoCent
      FROM documentos_compra
      WHERE empresa_id = ? AND tipo IN (${compraTipos}) AND estado <> 'ANULADO'
        AND date(fecha) >= date(?, 'start of month', '-11 months') AND date(fecha) <= ?
      GROUP BY substr(fecha, 1, 7)`, empresaId, hasta, hasta)
    const claves = [...new Set([...ventasMes, ...comprasMes].map((f) => txt(f, 'clave')))].sort()
    const mapaVentas = new Map(ventasMes.map((f) => [txt(f, 'clave'), n(f, 'montoCent')]))
    const mapaCompras = new Map(comprasMes.map((f) => [txt(f, 'clave'), n(f, 'montoCent')]))
    const tendencia = claves.map((clave) => ({
      clave,
      ventasCent: mapaVentas.get(clave) ?? 0,
      comprasCent: mapaCompras.get(clave) ?? 0
    }))

    // Flujo proyectado con vencimientos pendientes dentro del horizonte configurado.
    const proyeccion = consultar(`
      SELECT fecha, SUM(montoCent) AS montoCent FROM (
        SELECT date(COALESCE(NULLIF(vencimiento,''), fecha)) AS fecha, saldo_cent AS montoCent
          FROM cxc_documentos
          WHERE empresa_id = ? AND estado = 'PENDIENTE' AND saldo_cent > 0
            AND date(COALESCE(NULLIF(vencimiento,''), fecha)) BETWEEN date('now') AND date('now', '+' || ? || ' days')
        UNION ALL
        SELECT date(COALESCE(NULLIF(vencimiento,''), fecha)) AS fecha, -saldo_cent AS montoCent
          FROM cxp_documentos
          WHERE empresa_id = ? AND estado = 'PENDIENTE' AND saldo_cent > 0
            AND date(COALESCE(NULLIF(vencimiento,''), fecha)) BETWEEN date('now') AND date('now', '+' || ? || ' days')
      ) GROUP BY fecha ORDER BY fecha`, empresaId, dias, empresaId, dias)
      .map((f) => ({ fecha: txt(f, 'fecha'), montoCent: n(f, 'montoCent') }))

    // Envejecimiento de CxC con umbrales administrables del panel.
    const aging = consultar(`
      WITH base AS (
        SELECT saldo_cent, date(COALESCE(NULLIF(vencimiento,''), fecha)) AS vence
        FROM cxc_documentos
        WHERE empresa_id = ? AND estado <> 'ANULADO' AND saldo_cent > 0
      )
      SELECT CASE
          WHEN julianday('now') <= julianday(vence) THEN 'AL_DIA'
          WHEN julianday('now') - julianday(vence) <= ? THEN 'POR_VENCER'
          WHEN julianday('now') - julianday(vence) <= ? THEN 'VENCIDO'
          ELSE 'CRITICO'
        END AS bucket,
        SUM(saldo_cent) AS saldoCent, COUNT(*) AS documentos
      FROM base GROUP BY bucket`, empresaId, umbralCxc, umbralCxc * 2)
    const buckets = ['AL_DIA', 'POR_VENCER', 'VENCIDO', 'CRITICO']
    const envejecimiento = buckets.map((bucket) => {
      const fila = aging.find((f) => txt(f, 'bucket') === bucket)
      return { bucket, saldoCent: n(fila, 'saldoCent'), documentos: n(fila, 'documentos') }
    })

    const topClientes = consultar(`
      SELECT cliente_nombre AS cliente, SUM(${signoVenta}) AS totalCent, COUNT(*) AS documentos
      FROM documentos_venta
      WHERE empresa_id = ? AND tipo IN (${ventaTipos}) AND estado <> 'ANULADO'
        AND date(fecha) BETWEEN ? AND ?
      GROUP BY cliente_id ORDER BY totalCent DESC LIMIT ?`, empresaId, desde, hasta, filas)
      .map((f) => ({
        cliente: txt(f, 'cliente'), totalCent: n(f, 'totalCent'), documentos: n(f, 'documentos')
      }))

    const topProductos = consultar(`
      SELECT p.descripcion AS producto,
        SUM(CASE WHEN d.tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -l.total_cent ELSE l.total_cent END) AS totalCent,
        SUM(l.cantidad) AS cantidad
      FROM documento_venta_lineas l
      JOIN documentos_venta d ON d.id = l.doc_id
      JOIN productos p ON p.id = l.producto_id
      WHERE d.empresa_id = ? AND d.tipo IN (${ventaTipos}) AND d.estado <> 'ANULADO'
        AND date(d.fecha) BETWEEN ? AND ?
      GROUP BY l.producto_id ORDER BY totalCent DESC LIMIT ?`, empresaId, desde, hasta, filas)
      .map((f) => ({
        producto: txt(f, 'producto'), totalCent: n(f, 'totalCent'), cantidad: n(f, 'cantidad')
      }))

    // Los módulos 2026 solo se cuentan con su permiso específico; sin él, null.
    const presupuestosAprobados = ctx.permisos.includes('presupuestos.consultar')
      ? n(uno(`SELECT COUNT(*) AS total FROM presupuestos
        WHERE empresa_id = ? AND estado = 'APROBADO'`, empresaId), 'total')
      : null
    const ordenesAbiertas = ctx.permisos.includes('servicios.consultar')
      ? n(uno(`SELECT COUNT(*) AS total FROM ordenes_servicio
        WHERE empresa_id = ? AND estado IN ('RECIBIDA','EN_PROCESO','PENDIENTE_CLIENTE')`, empresaId), 'total')
      : null
    const leadsAbiertos = ctx.permisos.includes('crm.consultar')
      ? n(uno(`SELECT COUNT(*) AS total FROM crm_leads
        WHERE empresa_id = ? AND estado NOT IN ('GANADO','PERDIDO')`, empresaId), 'total')
      : null
    const activosActivos = ctx.permisos.includes('activos.consultar')
      ? n(uno(`SELECT COUNT(*) AS total FROM activos
        WHERE empresa_id = ? AND estado = 'ACTIVO'`, empresaId), 'total')
      : null
    const modulos = { presupuestosAprobados, ordenesAbiertas, leadsAbiertos, activosActivos }

    const senales: Senal[] = []
    if (kpis.sinStock > 0) {
      senales.push({ nivel: 'Alto', texto: `${kpis.sinStock} producto(s) sin existencias.` })
    }
    if (kpis.stockBajo > 0) {
      senales.push({ nivel: 'Medio', texto: `${kpis.stockBajo} producto(s) con stock por debajo de ${umbralStock}.` })
    }
    if (kpis.cxcVencido > 0) {
      senales.push({ nivel: 'Alto', texto: `${kpis.cxcVencido} documento(s) de CxC vencidos.` })
    }
    if (presupuestosAprobados !== null && presupuestosAprobados > 0) {
      senales.push({ nivel: 'Info', texto: `${presupuestosAprobados} presupuesto(s) aprobados.` })
    }
    if (ordenesAbiertas !== null && ordenesAbiertas > 0) {
      senales.push({ nivel: 'Info', texto: `${ordenesAbiertas} orden(es) de servicio abiertas.` })
    }
    if (leadsAbiertos !== null && leadsAbiertos > 0) {
      senales.push({ nivel: 'Info', texto: `${leadsAbiertos} lead(s) abiertos en CRM.` })
    }
    if (activosActivos !== null && activosActivos > 0) {
      senales.push({ nivel: 'Info', texto: `${activosActivos} activo(s) en estado activo.` })
    }
    const jerarquia: Record<string, number> = { Info: 0, Medio: 1, Alto: 2 }
    const minimo: Record<string, number> = { INFO: 0, MEDIO: 1, ALTO: 2 }
    const alertasVisibles = !panel2026.mostrarAlertas || !alertas.destinos.includes('PANEL')
      ? []
      : senales.filter((s) => jerarquia[s.nivel] >= (minimo[alertas.nivelMinimo] ?? 0))

    return {
      periodo: { desde, hasta, tipo: filtro.periodo, vista: filtro.vista, metricaPrincipal: filtro.metricaPrincipal },
      kpis,
      comparacion,
      tendencia,
      proyeccion,
      envejecimiento,
      topClientes,
      topProductos,
      modulos,
      alertas: alertasVisibles,
      config: {
        vista: filtro.vista,
        metricaPrincipal: filtro.metricaPrincipal,
        periodo: filtro.periodo,
        diasProyeccion: dias,
        umbralCxcDias: umbralCxc,
        umbralStockBajo: umbralStock,
        filas,
        compararPeriodo: panel2026.compararPeriodo,
        mostrarAlertas: panel2026.mostrarAlertas,
        nivelMinimo: alertas.nivelMinimo,
        seriesPorDefecto: settings.seriesPorDefecto
      }
    }
  }

  return { resumen }
}

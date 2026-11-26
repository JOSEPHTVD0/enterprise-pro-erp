import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { errors } from '@shared/errors'
import type { DashboardEjecutivoFiltro } from '@shared/schemas/paneles'
import { defaultSettings, type Settings } from '@shared/settings'
import { createAjustesService } from './ajustes.service'
import { createPanelPreferenciasService } from './panel-preferencias.service'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)
const txt = (f: Fila | undefined, k: string): string => String(f?.[k] ?? '')
const clamp = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

function fechaISO(d: Date): string { return d.toISOString().slice(0, 10) }

function rango(filtro: DashboardEjecutivoFiltro): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = filtro.fechaHasta || fechaISO(hoy)
  if (filtro.periodo === 'PERSONALIZADO') {
    return { desde: filtro.fechaDesde || `${hasta.slice(0, 4)}-01-01`, hasta }
  }
  if (filtro.periodo === 'MES') {
    return { desde: `${hasta.slice(0, 7)}-01`, hasta }
  }
  if (filtro.periodo === 'TRIMESTRE') {
    const d = new Date(`${hasta}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 2)
    d.setUTCDate(1)
    return { desde: fechaISO(d), hasta }
  }
  return { desde: `${hasta.slice(0, 4)}-01-01`, hasta }
}

/**
 * Panel ejecutivo 0.3.0. Solo lectura; todas las cifras salen de documentos reales.
 * La utilidad se expone únicamente si el usuario tiene `reportes.ganancia` y la
 * estación permite verla; filas y umbrales vienen de los ajustes de la empresa.
 */
export function createDashboardEjecutivoService(
  db: Db,
  ajustes: ReturnType<typeof createAjustesService> = createAjustesService(db),
  cargar: () => Settings = () => defaultSettings
) {
  const preferenciasPanel = createPanelPreferenciasService(db, ajustes, cargar)

  function exigir(ctx: SessionContext, clave: string): void {
    if (!ctx.permisos.includes(clave)) throw errors.forbidden()
  }

  function consultar(sql: string, ...args: unknown[]): Fila[] {
    return db.prepare(sql).all(...args) as Fila[]
  }

  function uno(sql: string, ...args: unknown[]): Fila | undefined {
    return db.prepare(sql).get(...args) as Fila | undefined
  }

  function resumen(ctx: SessionContext, entrada: DashboardEjecutivoFiltro): Record<string, unknown> {
    exigir(ctx, 'dashboard.consultar')
    const filtro = entrada ?? {}
    const { desde, hasta } = rango(filtro)
    const empresaId = ctx.empresaId
    const almacen = filtro.almacenId ? ' AND almacen_id = ?' : ''
    const argsAlmacen = filtro.almacenId ? [filtro.almacenId] : []
    const ventaTipos = `'FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO'`
    const signoVenta = `CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END`
    const compraTipos = `'FACTURA_COMPRA','DEVOLUCION_COMPRA'`
    const preferencias = preferenciasPanel.get(ctx)
    const panel2026 = ajustes.leerGrupo(empresaId, 'panel2026')
    const ajustesAlertas = ajustes.leerGrupo(empresaId, 'alertas')
    const config = {
      filas: clamp(panel2026.filas, 3, 50),
      stockBajoUmbral: ajustesAlertas.stockBajoUmbral,
      cxcDiasVencimiento: ajustesAlertas.cxcDiasVencimiento
    }
    const filasTop = Math.min(preferencias.filasPanel, config.filas)

    const ventas = uno(`SELECT COALESCE(SUM(${signoVenta}),0) AS total, COUNT(*) AS cantidad
      FROM documentos_venta WHERE empresa_id = ? AND tipo IN (${ventaTipos})
        AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?${almacen}`,
      empresaId, desde, hasta, ...argsAlmacen)
    const compras = uno(`SELECT COALESCE(SUM(CASE WHEN tipo = 'DEVOLUCION_COMPRA'
        THEN -total_cent ELSE total_cent END),0) AS total, COUNT(*) AS cantidad
      FROM documentos_compra WHERE empresa_id = ? AND tipo IN (${compraTipos})
        AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?${almacen}`,
      empresaId, desde, hasta, ...argsAlmacen)
    const cobros = uno(`SELECT COALESCE(SUM(monto_cent),0) AS total FROM cxc_recibos
      WHERE empresa_id = ? AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
    const pagos = uno(`SELECT COALESCE(SUM(monto_cent),0) AS total FROM cxp_pagos
      WHERE empresa_id = ? AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?`, empresaId, desde, hasta)
    const cxc = uno(`SELECT COALESCE(SUM(saldo_cent),0) AS total, COUNT(*) AS cantidad
      FROM cxc_documentos WHERE empresa_id = ? AND estado <> 'ANULADO'`, empresaId)
    const cxp = uno(`SELECT COALESCE(SUM(saldo_cent),0) AS total, COUNT(*) AS cantidad
      FROM cxp_documentos WHERE empresa_id = ? AND estado <> 'ANULADO'`, empresaId)
    const ganancia = ctx.permisos.includes('reportes.ganancia') && preferencias.verUtilidad
      ? uno(`SELECT COALESCE(SUM(total_cent - costo_total_cent),0) AS total
        FROM documentos_venta WHERE empresa_id = ? AND tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS')
          AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?${almacen}`,
        empresaId, desde, hasta, ...argsAlmacen)
      : undefined
    const clientes = uno('SELECT COUNT(*) AS total FROM clientes WHERE empresa_id = ? AND activo = 1', empresaId)
    const productos = uno('SELECT COUNT(*) AS total FROM productos WHERE empresa_id = ? AND activo = 1', empresaId)
    const agotados = uno('SELECT COUNT(*) AS total FROM existencias WHERE empresa_id = ? AND cantidad <= 0', empresaId)
    const stockBajo = uno(`SELECT COUNT(*) AS total FROM existencias
      WHERE empresa_id = ? AND cantidad > 0 AND cantidad < ?`, empresaId, config.stockBajoUmbral)

    const ventasCent = n(ventas, 'total')
    const utilidadCent = ganancia ? n(ganancia, 'total') : null
    const kpis = {
      ventasCent,
      comprasCent: n(compras, 'total'),
      facturas: n(ventas, 'cantidad'),
      comprasDocumentos: n(compras, 'cantidad'),
      cobrosCent: n(cobros, 'total'),
      pagosCent: n(pagos, 'total'),
      cxcSaldoCent: n(cxc, 'total'),
      cxcDocumentos: n(cxc, 'cantidad'),
      cxpSaldoCent: n(cxp, 'total'),
      cxpDocumentos: n(cxp, 'cantidad'),
      utilidadCent,
      margenBp: utilidadCent === null || ventasCent <= 0 ? null : Math.round((utilidadCent / ventasCent) * 10_000),
      clientesActivos: n(clientes, 'total'),
      productosActivos: n(productos, 'total'),
      productosAgotados: n(agotados, 'total'),
      productosStockBajo: n(stockBajo, 'total')
    }

    const serieMensual = consultar(`
      SELECT substr(fecha, 1, 7) AS clave,
        SUM(CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END) AS ventasCent,
        COUNT(*) AS documentos
      FROM documentos_venta
      WHERE empresa_id = ? AND tipo IN (${ventaTipos}) AND estado <> 'ANULADO'
        AND date(fecha) >= date(?, 'start of month', '-11 months') AND date(fecha) <= ?
      GROUP BY substr(fecha, 1, 7) ORDER BY clave`, empresaId, hasta, hasta)

    const serieDiaria = consultar(`
      SELECT date(fecha) AS clave,
        SUM(CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END) AS ventasCent,
        COUNT(*) AS documentos
      FROM documentos_venta
      WHERE empresa_id = ? AND tipo IN (${ventaTipos}) AND estado <> 'ANULADO'
        AND date(fecha) BETWEEN date(?, '-29 days') AND date(?)
      GROUP BY date(fecha) ORDER BY clave`, empresaId, hasta, hasta)

    const porFormaPago = consultar(`
      SELECT p.metodo AS clave, SUM(p.monto_cent) AS montoCent
      FROM documento_pagos p JOIN documentos_venta d ON d.id = p.doc_id
      WHERE p.empresa_id = ? AND date(d.fecha) BETWEEN ? AND ?
      GROUP BY p.metodo ORDER BY montoCent DESC`, empresaId, desde, hasta)

    const topProductos = consultar(`
      SELECT p.descripcion AS producto, SUM(l.total_cent) AS totalCent, SUM(l.cantidad) AS cantidad
      FROM documento_venta_lineas l
      JOIN documentos_venta d ON d.id = l.doc_id
      JOIN productos p ON p.id = l.producto_id
      WHERE d.empresa_id = ? AND d.tipo IN (${ventaTipos}) AND d.estado <> 'ANULADO'
        AND date(d.fecha) BETWEEN ? AND ?
      GROUP BY l.producto_id ORDER BY totalCent DESC LIMIT ?`, empresaId, desde, hasta, filasTop)

    const topClientes = consultar(`
      SELECT cliente_nombre AS cliente, SUM(${signoVenta}) AS totalCent, COUNT(*) AS documentos
      FROM documentos_venta
      WHERE empresa_id = ? AND tipo IN (${ventaTipos}) AND estado <> 'ANULADO'
        AND date(fecha) BETWEEN ? AND ?
      GROUP BY cliente_id ORDER BY totalCent DESC LIMIT ?`, empresaId, desde, hasta, filasTop)

    const presupuestos = ctx.permisos.includes('presupuestos.consultar')
      ? uno(`SELECT COUNT(*) AS total, COALESCE(SUM(monto_cent - ejecutado_cent),0) AS disponible
          FROM presupuestos WHERE empresa_id = ? AND estado = 'APROBADO'`, empresaId)
      : undefined
    const ordenesAbiertas = ctx.permisos.includes('servicios.consultar')
      ? uno(`SELECT COUNT(*) AS total FROM ordenes_servicio
          WHERE empresa_id = ? AND estado IN ('RECIBIDA','EN_PROCESO','PENDIENTE_CLIENTE')`, empresaId)
      : undefined
    const leadsAbiertos = ctx.permisos.includes('crm.consultar')
      ? uno(`SELECT COUNT(*) AS total FROM crm_leads
          WHERE empresa_id = ? AND estado NOT IN ('GANADO','PERDIDO')`, empresaId)
      : undefined

    const limiteCxc = new Date(`${hasta}T00:00:00Z`)
    limiteCxc.setUTCDate(limiteCxc.getUTCDate() - config.cxcDiasVencimiento)
    const cxcVencidos = uno(`
      SELECT COUNT(*) AS total FROM cxc_documentos
      WHERE empresa_id = ? AND estado = 'PENDIENTE' AND saldo_cent > 0
        AND date(COALESCE(NULLIF(vencimiento,''), fecha)) < date(?)`, empresaId, fechaISO(limiteCxc))

    const alertas: { nivel: string; texto: string }[] = []
    if (kpis.productosAgotados > 0) alertas.push({ nivel: 'Alto', texto: `${kpis.productosAgotados} producto(s) sin existencias.` })
    if (kpis.productosStockBajo > 0) {
      alertas.push({ nivel: 'Medio', texto: `${kpis.productosStockBajo} producto(s) con stock bajo (umbral ${config.stockBajoUmbral}).` })
    }
    if (kpis.cxcSaldoCent > 0) alertas.push({ nivel: 'Medio', texto: `CxC pendiente por ${(kpis.cxcSaldoCent / 100).toFixed(2)}.` })
    if (n(cxcVencidos, 'total') > 0) {
      alertas.push({
        nivel: 'Medio',
        texto: `${n(cxcVencidos, 'total')} documento(s) de CxC vencidos hace más de ${config.cxcDiasVencimiento} día(s).`
      })
    }
    if (presupuestos && n(presupuestos, 'total') > 0) {
      alertas.push({ nivel: 'Info', texto: `${n(presupuestos, 'total')} presupuesto(s) aprobados.` })
    }

    return {
      moneda: 'DOP',
      periodo: { desde, hasta, tipo: filtro.periodo ?? 'ANIO' },
      kpis,
      serieMensual: serieMensual.map((f) => ({
        clave: txt(f, 'clave'), ventasCent: n(f, 'ventasCent'), documentos: n(f, 'documentos')
      })),
      serieDiaria: serieDiaria.map((f) => ({
        clave: txt(f, 'clave'), ventasCent: n(f, 'ventasCent'), documentos: n(f, 'documentos')
      })),
      preferencias,
      config,
      porFormaPago: porFormaPago.map((f) => ({ clave: txt(f, 'clave'), montoCent: n(f, 'montoCent') })),
      topProductos: topProductos.map((f) => ({
        producto: txt(f, 'producto'), totalCent: n(f, 'totalCent'), cantidad: n(f, 'cantidad')
      })),
      topClientes: topClientes.map((f) => ({
        cliente: txt(f, 'cliente'), totalCent: n(f, 'totalCent'), documentos: n(f, 'documentos')
      })),
      modulos: {
        presupuestosAprobados: presupuestos ? n(presupuestos, 'total') : null,
        presupuestoDisponibleCent: presupuestos ? n(presupuestos, 'disponible') : null,
        ordenesAbiertas: ordenesAbiertas ? n(ordenesAbiertas, 'total') : null,
        leadsAbiertos: leadsAbiertos ? n(leadsAbiertos, 'total') : null
      },
      alertas
    }
  }

  return { resumen }
}

import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import type { Ajustes } from '@shared/schemas/ajustes'
import type { InteligenciaFiltro } from '@shared/schemas/paneles'
import { requirePermission } from './context'
import type { createAjustesService } from './ajustes.service'

type Fila = Record<string, unknown>
const n = (f: Fila | undefined, k: string): number => Number(f?.[k] ?? 0)
const txt = (f: Fila | undefined, k: string): string => String(f?.[k] ?? '')

function fechaISO(d: Date): string { return d.toISOString().slice(0, 10) }

function rango(filtro: InteligenciaFiltro): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = fechaISO(hoy)
  if (filtro.periodo === 'MES') return { desde: `${hasta.slice(0, 7)}-01`, hasta }
  if (filtro.periodo === 'TRIMESTRE') {
    const d = new Date(`${hasta}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 2)
    d.setUTCDate(1)
    return { desde: fechaISO(d), hasta }
  }
  return { desde: `${hasta.slice(0, 4)}-01-01`, hasta }
}

/**
 * Paneles avanzados de solo lectura. Toda cifra sale de SQLite de la empresa
 * activa; el renderer solo envía un filtro validado por Zod.
 */
export function createInteligenciaService(db: Db, ajustes: ReturnType<typeof createAjustesService>) {
  function consultar(sql: string, ...args: unknown[]): Fila[] {
    return db.prepare(sql).all(...args) as Fila[]
  }
  function uno(sql: string, ...args: unknown[]): Fila | undefined {
    return db.prepare(sql).get(...args) as Fila | undefined
  }

  function resumen(ctx: SessionContext, entrada: InteligenciaFiltro): Record<string, unknown> {
    requirePermission(ctx, 'inteligencia.consultar')
    const filtro = entrada ?? { periodo: 'ANIO' }
    const { desde, hasta } = rango(filtro)
    const empresaId = ctx.empresaId
    const config: Pick<Ajustes, 'alertas' | 'rendimiento' | 'widgets'> = {
      alertas: ajustes.leerGrupo(empresaId, 'alertas'),
      rendimiento: ajustes.leerGrupo(empresaId, 'rendimiento'),
      widgets: ajustes.leerGrupo(empresaId, 'widgets')
    }
    const limite = Math.max(3, Math.min(50, config.rendimiento.limiteFilas))
    const filasPanel = Math.min(config.widgets.filas, limite)

    const tiposVenta = `'FACTURA_CONTADO','FACTURA_CREDITO','POS'`
    const signoVenta = `CASE WHEN d.tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -1 ELSE 1 END`

    // 1. Tendencia mensual de ventas y compras.
    const ventasMes = consultar(`
      SELECT substr(fecha, 1, 7) AS clave,
        SUM(CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END) AS montoCent
      FROM documentos_venta
      WHERE empresa_id = ? AND tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO')
        AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?
      GROUP BY substr(fecha, 1, 7)`, empresaId, desde, hasta)
    const comprasMes = consultar(`
      SELECT substr(fecha, 1, 7) AS clave,
        SUM(CASE WHEN tipo = 'DEVOLUCION_COMPRA' THEN -total_cent ELSE total_cent END) AS montoCent
      FROM documentos_compra
      WHERE empresa_id = ? AND tipo IN ('FACTURA_COMPRA','DEVOLUCION_COMPRA')
        AND estado <> 'ANULADO' AND date(fecha) BETWEEN ? AND ?
      GROUP BY substr(fecha, 1, 7)`, empresaId, desde, hasta)
    const claves = [...new Set([...ventasMes, ...comprasMes].map((f) => txt(f, 'clave')))].sort()
    const mapaCompras = new Map(comprasMes.map((f) => [txt(f, 'clave'), n(f, 'montoCent')]))
    const tendencia = claves.map((clave) => ({
      clave,
      ventasCent: n(ventasMes.find((f) => txt(f, 'clave') === clave), 'montoCent'),
      comprasCent: mapaCompras.get(clave) ?? 0
    }))

    // 2. Envejecimiento de CxC y CxP (vencimiento vacío cae a la fecha del documento).
    const agingCxc = consultar(`
      WITH base AS (
        SELECT saldo_cent, date(COALESCE(NULLIF(vencimiento,''), fecha)) AS vence
        FROM cxc_documentos
        WHERE empresa_id = ? AND estado <> 'ANULADO' AND saldo_cent > 0
      )
      SELECT CASE
          WHEN julianday('now') <= julianday(vence) THEN 'AL_DIA'
          WHEN julianday('now') - julianday(vence) <= 30 THEN '1_30'
          WHEN julianday('now') - julianday(vence) <= 60 THEN '31_60'
          WHEN julianday('now') - julianday(vence) <= 90 THEN '61_90'
          ELSE '90_PLUS'
        END AS bucket,
        SUM(saldo_cent) AS saldoCent, COUNT(*) AS documentos
      FROM base GROUP BY bucket`, empresaId)
    const agingCxp = consultar(`
      WITH base AS (
        SELECT saldo_cent, date(COALESCE(NULLIF(vencimiento,''), fecha)) AS vence
        FROM cxp_documentos
        WHERE empresa_id = ? AND estado <> 'ANULADO' AND saldo_cent > 0
      )
      SELECT CASE
          WHEN julianday('now') <= julianday(vence) THEN 'AL_DIA'
          WHEN julianday('now') - julianday(vence) <= 30 THEN '1_30'
          WHEN julianday('now') - julianday(vence) <= 60 THEN '31_60'
          WHEN julianday('now') - julianday(vence) <= 90 THEN '61_90'
          ELSE '90_PLUS'
        END AS bucket,
        SUM(saldo_cent) AS saldoCent, COUNT(*) AS documentos
      FROM base GROUP BY bucket`, empresaId)
    const buckets = ['AL_DIA', '1_30', '31_60', '61_90', '90_PLUS']
    const normalizarAging = (filas: Fila[]): Record<string, unknown>[] => buckets.map((bucket) => {
      const fila = filas.find((f) => txt(f, 'bucket') === bucket)
      return { bucket, saldoCent: n(fila, 'saldoCent'), documentos: n(fila, 'documentos') }
    })

    // 3. Rotación y valorización de inventario (las salidas del kardex son negativas).
    const rotacion = ctx.permisos.includes('inventario.consultar') ? consultar(`
      WITH salidas AS (
        SELECT producto_id, SUM(-cantidad) AS unidadesSalida, SUM(-costo_total_cent) AS costoSalidasCent
        FROM movimientos_inventario
        WHERE empresa_id = ? AND tipo = 'VENTA' AND cantidad < 0 AND costo_total_cent < 0
          AND date(fecha) BETWEEN ? AND ?
        GROUP BY producto_id
      )
      SELECT p.descripcion AS producto, SUM(e.cantidad) AS cantidad, SUM(e.valor_cent) AS valorCent,
        COALESCE(s.unidadesSalida, 0) AS unidadesSalida,
        COALESCE(s.costoSalidasCent, 0) AS costoSalidasCent
      FROM existencias e
      JOIN productos p ON p.id = e.producto_id
      LEFT JOIN salidas s ON s.producto_id = e.producto_id
      WHERE e.empresa_id = ?
      GROUP BY p.id, p.descripcion
      ORDER BY valorCent DESC LIMIT ?`, empresaId, desde, hasta, empresaId, filasPanel).map((f) => ({
        producto: txt(f, 'producto'),
        cantidad: n(f, 'cantidad'),
        valorCent: n(f, 'valorCent'),
        unidadesSalida: n(f, 'unidadesSalida'),
        costoSalidasCent: n(f, 'costoSalidasCent')
      })) : []

    // 4. Rentabilidad por producto; columnas de costo solo con permiso explícito.
    const conCosto = ctx.permisos.includes('reportes.costo')
    const rentabilidad = ctx.permisos.includes('reportes.ganancia') ? consultar(`
      SELECT p.descripcion AS producto,
        SUM(${signoVenta} * l.total_cent) AS totalCent,
        SUM(${signoVenta} * l.cantidad * l.costo_unit_cent) AS costoCent
      FROM documento_venta_lineas l
      JOIN documentos_venta d ON d.id = l.doc_id
      JOIN productos p ON p.id = l.producto_id
      WHERE d.empresa_id = ? AND d.tipo IN (${tiposVenta},'NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO')
        AND d.estado <> 'ANULADO' AND date(d.fecha) BETWEEN ? AND ?
      GROUP BY p.id, p.descripcion
      ORDER BY totalCent DESC LIMIT ?`, empresaId, desde, hasta, filasPanel).map((f) => ({
        producto: txt(f, 'producto'),
        totalCent: n(f, 'totalCent'),
        costoCent: conCosto ? n(f, 'costoCent') : null,
        utilidadCent: conCosto ? n(f, 'totalCent') - n(f, 'costoCent') : null
      })) : []

    // 5. Flujo de efectivo proyectado a 28 días, con vencimientos reales.
    const flujo = consultar(`
      SELECT fecha, SUM(montoCent) AS montoCent FROM (
        SELECT date(vencimiento) AS fecha, saldo_cent AS montoCent
          FROM cxc_documentos
          WHERE empresa_id = ? AND estado = 'PENDIENTE' AND saldo_cent > 0
            AND date(vencimiento) BETWEEN date('now') AND date('now','+28 days')
        UNION ALL
        SELECT date(vencimiento) AS fecha, -saldo_cent AS montoCent
          FROM cxp_documentos
          WHERE empresa_id = ? AND estado = 'PENDIENTE' AND saldo_cent > 0
            AND date(vencimiento) BETWEEN date('now') AND date('now','+28 days')
      ) GROUP BY fecha ORDER BY fecha`, empresaId, empresaId).map((f) => ({
        fecha: txt(f, 'fecha'), montoCent: n(f, 'montoCent')
      }))

    // 6. Actividad de auditoría de los últimos 7 días.
    const auditoria = ctx.permisos.includes('auditoria.consultar') ? consultar(`
      SELECT date(fecha) AS dia, COUNT(*) AS eventos, COUNT(DISTINCT usuario_id) AS usuarios
      FROM auditoria
      WHERE empresa_id = ? AND date(fecha) >= date('now','-6 days')
      GROUP BY date(fecha) ORDER BY dia`, empresaId).map((f) => ({
        dia: txt(f, 'dia'), eventos: n(f, 'eventos'), usuarios: n(f, 'usuarios')
      })) : []

    // 7. Radar de los módulos 2026, respetando permisos específicos.
    const crm = ctx.permisos.includes('crm.consultar') ? consultar(`
      SELECT estado, COUNT(*) AS leads, SUM(valor_estimado_cent) AS valorEstimadoCent,
        ROUND(SUM(valor_estimado_cent * probabilidad) / 100.0, 0) AS valorPonderadoCent
      FROM crm_leads WHERE empresa_id = ? GROUP BY estado ORDER BY leads DESC`, empresaId).map((f) => ({
        estado: txt(f, 'estado'), leads: n(f, 'leads'),
        valorEstimadoCent: n(f, 'valorEstimadoCent'), valorPonderadoCent: n(f, 'valorPonderadoCent')
      })) : []
    const servicios = ctx.permisos.includes('servicios.consultar') ? consultar(`
      SELECT estado, COUNT(*) AS ordenes, SUM(total_cent) AS totalCent,
        SUM(CASE WHEN fecha_compromiso <> '' AND date(fecha_compromiso) < date('now')
          AND estado NOT IN ('FINALIZADA','ENTREGADA','ANULADA') THEN 1 ELSE 0 END) AS vencidas
      FROM ordenes_servicio WHERE empresa_id = ? GROUP BY estado ORDER BY ordenes DESC`, empresaId).map((f) => ({
        estado: txt(f, 'estado'), ordenes: n(f, 'ordenes'), totalCent: n(f, 'totalCent'), vencidas: n(f, 'vencidas')
      })) : []
    const activos = ctx.permisos.includes('activos.consultar') ? consultar(`
      SELECT categoria, estado, COUNT(*) AS activos, SUM(valor_adquisicion_cent) AS adquisicionCent,
        SUM(depreciacion_acumulada_cent) AS depreciacionCent,
        SUM(valor_adquisicion_cent - depreciacion_acumulada_cent) AS valorNetoCent
      FROM activos WHERE empresa_id = ? GROUP BY categoria, estado ORDER BY valorNetoCent DESC LIMIT ?`, empresaId, filasPanel).map((f) => ({
        categoria: txt(f, 'categoria'), estado: txt(f, 'estado'), activos: n(f, 'activos'),
        adquisicionCent: n(f, 'adquisicionCent'), depreciacionCent: n(f, 'depreciacionCent'),
        valorNetoCent: n(f, 'valorNetoCent')
      })) : []

    // 8. Diagnóstico operativo y alertas con umbrales administrables.
    const diag = uno(`
      SELECT
        (SELECT COUNT(*) FROM existencias WHERE empresa_id = ? AND cantidad <= 0) AS sinStock,
        (SELECT COUNT(*) FROM existencias WHERE empresa_id = ? AND cantidad > 0 AND cantidad < 5) AS stockBajo,
        (SELECT COUNT(*) FROM cxc_documentos WHERE empresa_id = ? AND estado = 'PENDIENTE'
          AND saldo_cent > 0 AND date(COALESCE(NULLIF(vencimiento,''), fecha)) < date('now')) AS cxcVencido,
        (SELECT COUNT(*) FROM cxp_documentos WHERE empresa_id = ? AND estado = 'PENDIENTE'
          AND saldo_cent > 0 AND date(COALESCE(NULLIF(vencimiento,''), fecha)) < date('now')) AS cxpVencido,
        (SELECT COUNT(*) FROM series_documento WHERE empresa_id = ? AND activa = 0) AS seriesInactivas`,
      empresaId, empresaId, empresaId, empresaId, empresaId)!
    const diagnostico = {
      sinStock: n(diag, 'sinStock'),
      stockBajo: n(diag, 'stockBajo'),
      cxcVencido: n(diag, 'cxcVencido'),
      cxpVencido: n(diag, 'cxpVencido'),
      seriesInactivas: n(diag, 'seriesInactivas')
    }
    const cxcPorVencer = n(uno(`SELECT COUNT(*) AS total FROM cxc_documentos
      WHERE empresa_id = ? AND estado = 'PENDIENTE' AND saldo_cent > 0
        AND date(COALESCE(NULLIF(vencimiento,''), fecha)) BETWEEN date('now') AND date('now', '+' || ? || ' days')`,
      empresaId, config.alertas.cxcDiasVencimiento), 'total')
    const seriesPorAgotarse = n(uno(`SELECT COUNT(*) AS total FROM series_documento
      WHERE empresa_id = ? AND activa = 1 AND alerta_min <= ?`, empresaId, config.alertas.seriesRestantes), 'total')

    const jerarquia: Record<string, number> = { Medio: 1, Alto: 2 }
    const minimo: Record<string, number> = { INFO: 0, MEDIO: 1, ALTO: 2 }
    const senales: { nivel: string; texto: string }[] = []
    if (diagnostico.stockBajo >= config.alertas.stockBajoUmbral) {
      senales.push({ nivel: 'Medio', texto: `${diagnostico.stockBajo} producto(s) con stock bajo (umbral ${config.alertas.stockBajoUmbral}).` })
    }
    if (diagnostico.sinStock > 0) {
      senales.push({ nivel: 'Alto', texto: `${diagnostico.sinStock} producto(s) sin existencias.` })
    }
    if (cxcPorVencer > 0) {
      senales.push({ nivel: 'Medio', texto: `${cxcPorVencer} documento(s) de CxC por vencer en ${config.alertas.cxcDiasVencimiento} días.` })
    }
    if (diagnostico.cxcVencido > 0) {
      senales.push({ nivel: 'Alto', texto: `${diagnostico.cxcVencido} documento(s) de CxC vencidos.` })
    }
    if (diagnostico.cxpVencido > 0) {
      senales.push({ nivel: 'Medio', texto: `${diagnostico.cxpVencido} documento(s) de CxP vencidos.` })
    }
    if (seriesPorAgotarse > 0 || diagnostico.seriesInactivas > 0) {
      senales.push({
        nivel: 'Medio',
        texto: `${seriesPorAgotarse} serie(s) con alerta baja y ${diagnostico.seriesInactivas} serie(s) inactivas.`
      })
    }
    const alertas = config.alertas.destinos.includes('PANEL')
      ? senales.filter((s) => (jerarquia[s.nivel] ?? 0) >= (minimo[config.alertas.nivelMinimo] ?? 0))
      : []

    return {
      periodo: { desde, hasta, tipo: filtro.periodo ?? 'ANIO' },
      tendencia,
      agingCxc: normalizarAging(agingCxc),
      agingCxp: normalizarAging(agingCxp),
      rotacion,
      rentabilidad,
      flujo,
      auditoria,
      modulos: { crm, servicios, activos },
      diagnostico,
      alertas,
      umbrales: {
        stockBajo: config.alertas.stockBajoUmbral,
        cxcDias: config.alertas.cxcDiasVencimiento,
        seriesRestantes: config.alertas.seriesRestantes
      }
    }
  }

  return { resumen }
}

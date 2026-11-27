import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import { writeAudit } from '../repositories/auditoria.repo'
import type { SessionContext } from './context'
import { errors } from '@shared/errors'
import { getEmpresa } from '../repositories/configuracion.repo'
import type {
  ReportesFiltro, ReportesSerieInput, ReportesExportarInput, ReportesImprimirInput, TipoReporte
} from '@shared/schemas/reportes'

type Fila = Record<string, unknown>
export type FilaReporte = Record<string, string | number>
export interface ColumnaReporte { key: string; header: string; width?: number }
export interface DatosReporte {
  titulo: string
  columnas: ColumnaReporte[]
  filas: FilaReporte[]
  totales: Record<string, number>
  registros: number
}
export interface IndicadoresReporte {
  moneda: 'DOP'
  ventasHoyCent: number
  ventasMesCent: number
  comprasMesCent: number
  cxcSaldoCent: number
  cxpSaldoCent: number
  productosAgotados: number
  gananciaMesCent: number | null
  cajaAbierta: {
    id: number
    cajaId: number
    fechaApertura: string
    fondoCent: number
  } | null
}
export interface PuntoSerie {
  clave: string
  ventasCent: number
  comprasCent: number
  cobrosCent: number
  pagosCent: number
}

const n = (fila: Fila | undefined, clave: string): number => Number(fila?.[clave] ?? 0)
const txt = (fila: Fila | undefined, clave: string): string => String(fila?.[clave] ?? '')
const hoy = (): string => new Date().toISOString().slice(0, 10)

function desplazar(iso: string, dias: number): string {
  const fecha = new Date(`${iso}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** Reportes y estadísticas de Fase 9. Solo consultas; ninguna operación escribe en la BD. */
export function createReportesService(db: Db) {
  function tiene(ctx: SessionContext, ...permisos: string[]): boolean {
    return permisos.some((permiso) => ctx.permisos.includes(permiso))
  }

  function exigir(ctx: SessionContext, ...permisos: string[]): void {
    if (!tiene(ctx, ...permisos)) throw errors.forbidden()
  }

  function audit(
    ctx: SessionContext, operacion: string, entidad: string, id: number | null,
    antes: unknown, despues: unknown
  ): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  function consultar(sql: string, ...args: unknown[]): Fila[] {
    return db.prepare(sql).all(...args) as Fila[]
  }

  function uno(sql: string, ...args: unknown[]): Fila | undefined {
    return db.prepare(sql).get(...args) as Fila | undefined
  }

  function filtroDocumentos(filtro: ReportesFiltro, alias = 'd'): { where: string; args: unknown[]; limite: number } {
    const clauses = [`${alias}.empresa_id = ?`]
    const args: unknown[] = []
    if (filtro.fechaDesde) { clauses.push(`date(${alias}.fecha) >= ?`); args.push(filtro.fechaDesde) }
    if (filtro.fechaHasta) { clauses.push(`date(${alias}.fecha) <= ?`); args.push(filtro.fechaHasta) }
    if (filtro.tipo) { clauses.push(`${alias}.tipo = ?`); args.push(filtro.tipo) }
    if (filtro.estado) { clauses.push(`${alias}.estado = ?`); args.push(filtro.estado) }
    return { where: clauses.join(' AND '), args, limite: filtro.limite }
  }

  function indicadores(ctx: SessionContext): IndicadoresReporte {
    exigir(ctx, 'reportes.consultar')
    const empresaId = ctx.empresaId
    const venta = `tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO')`
    const signoVenta = `CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END`
    const compra = `tipo IN ('FACTURA_COMPRA','DEVOLUCION_COMPRA')`
    const signoCompra = `CASE WHEN tipo = 'DEVOLUCION_COMPRA' THEN -total_cent ELSE total_cent END`

    const ventasHoy = uno(`
      SELECT COALESCE(SUM(${signoVenta}), 0) AS total FROM documentos_venta
      WHERE empresa_id = ? AND ${venta} AND estado <> 'ANULADO' AND date(fecha) = date('now')
    `, empresaId)
    const ventasMes = uno(`
      SELECT COALESCE(SUM(${signoVenta}), 0) AS total FROM documentos_venta
      WHERE empresa_id = ? AND ${venta} AND estado <> 'ANULADO' AND date(fecha) >= date('now','start of month')
    `, empresaId)
    const comprasMes = uno(`
      SELECT COALESCE(SUM(${signoCompra}), 0) AS total FROM documentos_compra
      WHERE empresa_id = ? AND ${compra} AND estado <> 'ANULADO' AND date(fecha) >= date('now','start of month')
    `, empresaId)
    const cxc = uno(`
      SELECT COALESCE(SUM(saldo_cent), 0) AS total FROM cxc_documentos
      WHERE empresa_id = ? AND estado <> 'ANULADO'
    `, empresaId)
    const cxp = uno(`
      SELECT COALESCE(SUM(saldo_cent), 0) AS total FROM cxp_documentos
      WHERE empresa_id = ? AND estado <> 'ANULADO'
    `, empresaId)
    const agotados = uno(`
      SELECT COUNT(*) AS total FROM existencias WHERE empresa_id = ? AND cantidad <= 0
    `, empresaId)
    const caja = uno(`
      SELECT id, caja_id, fecha_apertura, monto_apertura_cent
      FROM caja_sesiones WHERE empresa_id = ? AND estado = 'ABIERTA'
      ORDER BY fecha_apertura DESC, id DESC LIMIT 1
    `, empresaId)
    const ganancia = tiene(ctx, 'reportes.ganancia')
      ? uno(`
          SELECT COALESCE(SUM(total_cent - costo_total_cent), 0) AS total FROM documentos_venta
          WHERE empresa_id = ? AND tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS')
            AND estado <> 'ANULADO' AND date(fecha) >= date('now','start of month')
        `, empresaId)
      : undefined

    return {
      moneda: 'DOP',
      ventasHoyCent: n(ventasHoy, 'total'),
      ventasMesCent: n(ventasMes, 'total'),
      comprasMesCent: n(comprasMes, 'total'),
      cxcSaldoCent: n(cxc, 'total'),
      cxpSaldoCent: n(cxp, 'total'),
      productosAgotados: n(agotados, 'total'),
      gananciaMesCent: ganancia ? n(ganancia, 'total') : null,
      cajaAbierta: caja ? {
        id: n(caja, 'id'),
        cajaId: n(caja, 'caja_id'),
        fechaApertura: txt(caja, 'fecha_apertura'),
        fondoCent: n(caja, 'monto_apertura_cent')
      } : null
    }
  }

  function serie(ctx: SessionContext, filtro: ReportesSerieInput = {}): {
    desde: string; hasta: string; granularidad: 'DIA' | 'MES'; puntos: PuntoSerie[]
  } {
    exigir(ctx, 'reportes.consultar')
    const granularidad = filtro.granularidad ?? 'DIA'
    const hasta = filtro.fechaHasta || hoy()
    const desde = filtro.fechaDesde || desplazar(hasta, -29)
    const formato = granularidad === 'MES' ? '%Y-%m' : '%Y-%m-%d'
    const empresaId = ctx.empresaId

    function agrupar(sql: string): Map<string, number> {
      const mapa = new Map<string, number>()
      for (const fila of consultar(sql, empresaId, desde, hasta)) {
        mapa.set(txt(fila, 'clave'), n(fila, 'total'))
      }
      return mapa
    }

    const ventas = agrupar(`
      SELECT strftime('${formato}', date(fecha)) AS clave,
        SUM(CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END) AS total
      FROM documentos_venta
      WHERE empresa_id = ? AND date(fecha) BETWEEN ? AND ?
        AND tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO')
        AND estado <> 'ANULADO' GROUP BY clave
    `)
    const compras = agrupar(`
      SELECT strftime('${formato}', date(fecha)) AS clave,
        SUM(CASE WHEN tipo = 'DEVOLUCION_COMPRA' THEN -total_cent ELSE total_cent END) AS total
      FROM documentos_compra
      WHERE empresa_id = ? AND date(fecha) BETWEEN ? AND ?
        AND tipo IN ('FACTURA_COMPRA','DEVOLUCION_COMPRA') AND estado <> 'ANULADO'
      GROUP BY clave
    `)
    const cobros = agrupar(`
      SELECT strftime('${formato}', date(fecha)) AS clave, SUM(monto_cent) AS total
      FROM cxc_recibos WHERE empresa_id = ? AND date(fecha) BETWEEN ? AND ?
        AND estado = 'CONTABILIZADO' GROUP BY clave
    `)
    const pagos = agrupar(`
      SELECT strftime('${formato}', date(fecha)) AS clave, SUM(monto_cent) AS total
      FROM cxp_pagos WHERE empresa_id = ? AND date(fecha) BETWEEN ? AND ?
        AND estado = 'CONTABILIZADO' GROUP BY clave
    `)

    const claves = new Set([...ventas.keys(), ...compras.keys(), ...cobros.keys(), ...pagos.keys()])
    const puntos: PuntoSerie[] = [...claves].sort().map((clave) => ({
      clave,
      ventasCent: ventas.get(clave) ?? 0,
      comprasCent: compras.get(clave) ?? 0,
      cobrosCent: cobros.get(clave) ?? 0,
      pagosCent: pagos.get(clave) ?? 0
    }))
    return { desde, hasta, granularidad, puntos }
  }

  function resumen(columnas: ColumnaReporte[], filas: FilaReporte[]): DatosReporte {
    const totales: Record<string, number> = {}
    for (const columna of columnas.filter((c) => c.key.endsWith('Cent'))) {
      totales[columna.key] = filas.reduce((suma, fila) => suma + Number(fila[columna.key] ?? 0), 0)
    }
    return { titulo: '', columnas, filas, totales, registros: filas.length }
  }

  function datosReporte(
    ctx: SessionContext, reporte: TipoReporte, filtroInput?: ReportesFiltro
  ): DatosReporte {
    exigir(ctx, 'reportes.consultar')
    const filtro: ReportesFiltro = {
      fechaDesde: filtroInput?.fechaDesde,
      fechaHasta: filtroInput?.fechaHasta,
      tipo: filtroInput?.tipo,
      estado: filtroInput?.estado,
      entidadId: filtroInput?.entidadId,
      limite: filtroInput?.limite ?? 300
    }
    const verCosto = tiene(ctx, 'reportes.costo')
    const verGanancia = tiene(ctx, 'reportes.ganancia')
    const hoyIso = hoy()

    if (reporte === 'VENTAS') {
      const { where, args, limite } = filtroDocumentos(filtro)
      const filas = consultar(`
        SELECT d.id, d.numero, d.es_ncf, d.tipo, d.estado, date(d.fecha) AS fecha,
          d.cliente_nombre AS entidad, d.cliente_rnc AS rnc,
          d.subtotal_cent, d.descuento_cent, d.impuesto_cent, d.total_cent, d.costo_total_cent
        FROM documentos_venta d WHERE ${where}
          AND d.tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','NOTA_DEBITO','DEVOLUCION_VENTA')
        ORDER BY d.fecha DESC, d.id DESC LIMIT ?
      `, ctx.empresaId, ...args, limite).map((fila): FilaReporte => {
        const signo = ['NOTA_CREDITO', 'DEVOLUCION_VENTA'].includes(txt(fila, 'tipo')) ? -1 : 1
        const total = signo * n(fila, 'total_cent')
        const costo = signo * n(fila, 'costo_total_cent')
        const base: FilaReporte = {
          numero: txt(fila, 'numero'),
          esNcf: n(fila, 'es_ncf') ? 'SÍ' : 'NO',
          tipo: txt(fila, 'tipo'),
          fecha: txt(fila, 'fecha'),
          entidad: txt(fila, 'entidad'),
          rnc: txt(fila, 'rnc'),
          estado: txt(fila, 'estado'),
          subtotalCent: signo * n(fila, 'subtotal_cent'),
          descuentoCent: signo * n(fila, 'descuento_cent'),
          impuestoCent: signo * n(fila, 'impuesto_cent'),
          totalCent: total
        }
        if (verCosto) base.costoTotalCent = costo
        if (verGanancia) base.gananciaCent = total - costo
        return base
      })
      const columnas: ColumnaReporte[] = [
        { key: 'numero', header: 'Número', width: 20 },
        { key: 'esNcf', header: 'NCF', width: 8 },
        { key: 'tipo', header: 'Tipo', width: 22 },
        { key: 'fecha', header: 'Fecha', width: 12 },
        { key: 'entidad', header: 'Cliente', width: 30 },
        { key: 'rnc', header: 'RNC/Cédula', width: 18 },
        { key: 'estado', header: 'Estado', width: 15 },
        { key: 'subtotalCent', header: 'Subtotal RD$', width: 16 },
        { key: 'descuentoCent', header: 'Descuento RD$', width: 16 },
        { key: 'impuestoCent', header: 'ITBIS RD$', width: 16 },
        { key: 'totalCent', header: 'Total RD$', width: 16 }
      ]
      if (verCosto) columnas.push({ key: 'costoTotalCent', header: 'Costo RD$', width: 16 })
      if (verGanancia) columnas.push({ key: 'gananciaCent', header: 'Ganancia RD$', width: 16 })
      return { ...resumen(columnas, filas), titulo: 'Reporte de ventas' }
    }

    if (reporte === 'COMPRAS') {
      const { where, args, limite } = filtroDocumentos(filtro)
      const filas = consultar(`
        SELECT d.numero, d.numero_proveedor, d.tipo, d.estado, date(d.fecha) AS fecha,
          d.proveedor_nombre AS entidad, d.proveedor_rnc AS rnc,
          d.subtotal_cent, d.descuento_cent, d.impuesto_cent, d.gasto_cent,
          d.total_cent, d.costo_total_cent
        FROM documentos_compra d WHERE ${where}
        ORDER BY d.fecha DESC, d.id DESC LIMIT ?
      `, ctx.empresaId, ...args, limite).map((fila): FilaReporte => {
        const signo = txt(fila, 'tipo') === 'DEVOLUCION_COMPRA' ? -1 : 1
        const base: FilaReporte = {
          numero: txt(fila, 'numero'),
          numeroProveedor: txt(fila, 'numero_proveedor'),
          tipo: txt(fila, 'tipo'),
          fecha: txt(fila, 'fecha'),
          entidad: txt(fila, 'entidad'),
          rnc: txt(fila, 'rnc'),
          estado: txt(fila, 'estado'),
          subtotalCent: signo * n(fila, 'subtotal_cent'),
          descuentoCent: signo * n(fila, 'descuento_cent'),
          impuestoCent: signo * n(fila, 'impuesto_cent'),
          gastoCent: signo * n(fila, 'gasto_cent'),
          totalCent: signo * n(fila, 'total_cent')
        }
        if (verCosto) base.costoTotalCent = signo * n(fila, 'costo_total_cent')
        return base
      })
      const columnas: ColumnaReporte[] = [
        { key: 'numero', header: 'Número', width: 22 },
        { key: 'numeroProveedor', header: 'NCF proveedor', width: 20 },
        { key: 'tipo', header: 'Tipo', width: 22 },
        { key: 'fecha', header: 'Fecha', width: 12 },
        { key: 'entidad', header: 'Proveedor', width: 30 },
        { key: 'rnc', header: 'RNC', width: 18 },
        { key: 'estado', header: 'Estado', width: 16 },
        { key: 'subtotalCent', header: 'Subtotal RD$', width: 16 },
        { key: 'descuentoCent', header: 'Descuento RD$', width: 16 },
        { key: 'impuestoCent', header: 'ITBIS RD$', width: 16 },
        { key: 'gastoCent', header: 'Gasto RD$', width: 16 },
        { key: 'totalCent', header: 'Total RD$', width: 16 }
      ]
      if (verCosto) columnas.push({ key: 'costoTotalCent', header: 'Costo RD$', width: 16 })
      return { ...resumen(columnas, filas), titulo: 'Reporte de compras' }
    }

    if (reporte === 'INVENTARIO') {
      const clauses = ['e.empresa_id = ?']
      const args: unknown[] = [ctx.empresaId]
      if (filtro.entidadId) { clauses.push('e.producto_id = ?'); args.push(filtro.entidadId) }
      if (filtro.tipo) { clauses.push('p.codigo LIKE ?'); args.push(`%${filtro.tipo}%`) }
      if (filtro.estado) { clauses.push('a.nombre LIKE ?'); args.push(`%${filtro.estado}%`) }
      const filas = consultar(`
        SELECT p.codigo, p.descripcion AS producto, a.nombre AS almacen, e.cantidad, e.valor_cent
        FROM existencias e
        JOIN productos p ON p.id = e.producto_id
        JOIN almacenes a ON a.id = e.almacen_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY p.descripcion, a.nombre LIMIT ?
      `, ...args, filtro.limite).map((fila): FilaReporte => {
        const base: FilaReporte = {
          codigo: txt(fila, 'codigo'),
          producto: txt(fila, 'producto'),
          almacen: txt(fila, 'almacen'),
          cantidad: Number(fila.cantidad ?? 0)
        }
        if (verCosto) base.valorCent = n(fila, 'valor_cent')
        return base
      })
      const columnas: ColumnaReporte[] = [
        { key: 'codigo', header: 'Código', width: 16 },
        { key: 'producto', header: 'Producto', width: 34 },
        { key: 'almacen', header: 'Almacén', width: 22 },
        { key: 'cantidad', header: 'Cantidad', width: 14 }
      ]
      if (verCosto) columnas.push({ key: 'valorCent', header: 'Valor RD$', width: 18 })
      return { ...resumen(columnas, filas), titulo: 'Reporte de inventario' }
    }

    if (reporte === 'CXC' || reporte === 'CXP') {
      exigir(ctx, reporte === 'CXC' ? 'cxc.consultar' : 'cxp.consultar')
      const esCxc = reporte === 'CXC'
      const tabla = esCxc ? 'cxc_documentos' : 'cxp_documentos'
      const entidadTabla = esCxc ? 'clientes' : 'proveedores'
      const entidadId = esCxc ? 'cliente_id' : 'proveedor_id'
      const rncColumna = esCxc ? 'rnc_cedula' : 'rnc'
      const entidadColumna = esCxc ? 'e.nombre' : 'e.nombre_comercial'
      const clauses = [
        `d.empresa_id = ?`, `d.estado <> 'ANULADO'`
      ]
      const args: unknown[] = [ctx.empresaId]
      if (filtro.fechaDesde) { clauses.push('date(d.fecha) >= ?'); args.push(filtro.fechaDesde) }
      if (filtro.fechaHasta) { clauses.push('date(d.fecha) <= ?'); args.push(filtro.fechaHasta) }
      if (filtro.estado) { clauses.push('d.estado = ?'); args.push(filtro.estado) }
      if (filtro.entidadId) { clauses.push(`d.${entidadId} = ?`); args.push(filtro.entidadId) }
      const filas = consultar(`
        SELECT d.numero_documento, date(d.fecha) AS fecha, date(d.vencimiento) AS vencimiento,
          d.monto_cent, d.saldo_cent, d.estado, ${entidadColumna} AS entidad, e.${rncColumna} AS rnc
        FROM ${tabla} d JOIN ${entidadTabla} e ON e.id = d.${entidadId}
        WHERE ${clauses.join(' AND ')}
        ORDER BY date(d.fecha) DESC, d.id DESC LIMIT ?
      `, ...args, filtro.limite).map((fila): FilaReporte => ({
        numeroDocumento: txt(fila, 'numero_documento'),
        fecha: txt(fila, 'fecha'),
        vencimiento: txt(fila, 'vencimiento'),
        entidad: txt(fila, 'entidad'),
        rnc: txt(fila, 'rnc'),
        montoCent: n(fila, 'monto_cent'),
        saldoCent: n(fila, 'saldo_cent'),
        dias: Math.max(0, Math.round((Date.parse(`${hoyIso}T00:00:00Z`) - Date.parse(`${txt(fila, 'fecha')}T00:00:00Z`)) / 86_400_000)),
        estado: txt(fila, 'estado')
      }))
      return {
        ...resumen([
          { key: 'numeroDocumento', header: 'Número', width: 22 },
          { key: 'fecha', header: 'Fecha', width: 12 },
          { key: 'vencimiento', header: 'Vencimiento', width: 13 },
          { key: 'entidad', header: esCxc ? 'Cliente' : 'Proveedor', width: 30 },
          { key: 'rnc', header: 'RNC/Cédula', width: 18 },
          { key: 'montoCent', header: 'Monto RD$', width: 16 },
          { key: 'saldoCent', header: 'Saldo RD$', width: 16 },
          { key: 'dias', header: 'Días', width: 9 },
          { key: 'estado', header: 'Estado', width: 13 }
        ], filas),
        titulo: esCxc ? 'Reporte de cuentas por cobrar' : 'Reporte de cuentas por pagar'
      }
    }

    if (reporte === 'LIBRO606') {
      const { where, args, limite } = filtroDocumentos(filtro)
      const filas = consultar(`
        SELECT date(d.fecha) AS fecha, d.tipo, d.numero_proveedor, d.proveedor_nombre AS entidad,
          d.proveedor_rnc AS rnc, d.subtotal_cent, d.descuento_cent, d.impuesto_cent, d.total_cent
        FROM documentos_compra d WHERE ${where}
          AND d.tipo IN ('FACTURA_COMPRA','DEVOLUCION_COMPRA') AND d.estado <> 'ANULADO'
        ORDER BY d.fecha, d.id LIMIT ?
      `, ctx.empresaId, ...args, limite).map((fila): FilaReporte => {
        const signo = txt(fila, 'tipo') === 'DEVOLUCION_COMPRA' ? -1 : 1
        return {
          fecha: txt(fila, 'fecha'),
          tipo: txt(fila, 'tipo'),
          ncfProveedor: txt(fila, 'numero_proveedor'),
          entidad: txt(fila, 'entidad'),
          rnc: txt(fila, 'rnc'),
          subtotalCent: signo * n(fila, 'subtotal_cent'),
          descuentoCent: signo * n(fila, 'descuento_cent'),
          impuestoCent: signo * n(fila, 'impuesto_cent'),
          totalCent: signo * n(fila, 'total_cent')
        }
      })
      return {
        ...resumen([
          { key: 'fecha', header: 'Fecha', width: 12 },
          { key: 'tipo', header: 'Tipo', width: 22 },
          { key: 'ncfProveedor', header: 'NCF proveedor', width: 20 },
          { key: 'entidad', header: 'Proveedor', width: 30 },
          { key: 'rnc', header: 'RNC', width: 18 },
          { key: 'subtotalCent', header: 'Subtotal RD$', width: 16 },
          { key: 'descuentoCent', header: 'Descuento RD$', width: 16 },
          { key: 'impuestoCent', header: 'ITBIS RD$', width: 16 },
          { key: 'totalCent', header: 'Total RD$', width: 16 }
        ], filas),
        titulo: 'Libro de compras (606) — borrador local'
      }
    }

    // LIBRO607
    const { where, args, limite } = filtroDocumentos(filtro)
    const filas = consultar(`
      SELECT date(d.fecha) AS fecha, d.tipo, d.numero, d.es_ncf, d.cliente_nombre AS entidad,
        d.cliente_rnc AS rnc, d.subtotal_cent, d.descuento_cent, d.impuesto_cent,
        d.total_cent, d.estado
      FROM documentos_venta d WHERE ${where}
        AND d.tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','NOTA_DEBITO','DEVOLUCION_VENTA')
        AND d.estado <> 'ANULADO'
      ORDER BY d.fecha, d.id LIMIT ?
    `, ctx.empresaId, ...args, limite).map((fila): FilaReporte => {
      const signo = ['NOTA_CREDITO', 'DEVOLUCION_VENTA'].includes(txt(fila, 'tipo')) ? -1 : 1
      return {
        fecha: txt(fila, 'fecha'),
        tipo: txt(fila, 'tipo'),
        numero: txt(fila, 'numero'),
        esNcf: n(fila, 'es_ncf') ? 'SÍ' : 'NO',
        entidad: txt(fila, 'entidad'),
        rnc: txt(fila, 'rnc'),
        subtotalCent: signo * n(fila, 'subtotal_cent'),
        descuentoCent: signo * n(fila, 'descuento_cent'),
        impuestoCent: signo * n(fila, 'impuesto_cent'),
        totalCent: signo * n(fila, 'total_cent'),
        estado: txt(fila, 'estado')
      }
    })
    return {
      ...resumen([
        { key: 'fecha', header: 'Fecha', width: 12 },
        { key: 'tipo', header: 'Tipo', width: 22 },
        { key: 'numero', header: 'Número / NCF', width: 20 },
        { key: 'esNcf', header: 'NCF', width: 8 },
        { key: 'entidad', header: 'Cliente', width: 30 },
        { key: 'rnc', header: 'RNC/Cédula', width: 18 },
        { key: 'subtotalCent', header: 'Subtotal RD$', width: 16 },
        { key: 'descuentoCent', header: 'Descuento RD$', width: 16 },
        { key: 'impuestoCent', header: 'ITBIS RD$', width: 16 },
        { key: 'totalCent', header: 'Total RD$', width: 16 },
        { key: 'estado', header: 'Estado', width: 14 }
      ], filas),
      titulo: 'Libro de ventas (607) — borrador local'
    }
  }

  function valorExportable(valor: string | number, clave: string): string | number {
    if (clave.endsWith('Cent')) return (Number(valor) / 100).toFixed(2)
    return valor
  }

  function escaparCsv(valor: string | number): string {
    const texto = String(valor ?? '')
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }

  async function exportar(ctx: SessionContext, input: ReportesExportarInput): Promise<{ filename: string; base64: string; mime: string }> {
    exigir(ctx, 'reportes.exportar')
    const datos = datosReporte(ctx, input.reporte, input.filtro)
    const nombre = `reporte_${input.reporte.toLowerCase()}_${hoy()}`
    const wsDatos = datos.columnas.map((columna) => ({
      header: columna.header,
      key: columna.key,
      width: columna.width
    }))
    const filasExportables = datos.filas.map((fila) => Object.fromEntries(
      datos.columnas.map((columna) => [columna.key, valorExportable(fila[columna.key] ?? '', columna.key)])
    ))
    const registrar = (filename: string): void => {
      audit(ctx, 'EXPORTAR', input.reporte, null, input.filtro ?? {}, {
        registros: datos.filas.length, filename, formato: input.formato
      })
    }

    if (input.formato === 'CSV') {
      const lineas = [
        datos.columnas.map((c) => escaparCsv(c.header)).join(';'),
        ...filasExportables.map((fila) => datos.columnas.map((c) => escaparCsv(fila[c.key])).join(';'))
      ]
      const filename = `${nombre}.csv`
      registrar(filename)
      return {
        filename,
        base64: Buffer.from(`\uFEFF${lineas.join('\r\n')}`, 'utf8').toString('base64'),
        mime: 'text/csv;charset=utf-8'
      }
    }

    const libro = new ExcelJS.Workbook()
    libro.creator = 'ENTERPRISE PRO ERP'
    libro.created = new Date()
    const hoja = libro.addWorksheet(datos.titulo.slice(0, 30))
    hoja.columns = wsDatos
    hoja.getRow(1).font = { bold: true }
    for (const fila of filasExportables) hoja.addRow(fila)
    const buffer = await libro.xlsx.writeBuffer()
    const filename = `${nombre}.xlsx`
    registrar(filename)
    return {
      filename,
      base64: Buffer.from(buffer).toString('base64'),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }

  function imprimir(ctx: SessionContext, input: ReportesImprimirInput) {
    exigir(ctx, 'reportes.imprimir')
    const datos = datosReporte(ctx, input.reporte, input.filtro)
    const esLibro = input.reporte === 'LIBRO606' || input.reporte === 'LIBRO607'
    return {
      reporte: input.reporte,
      titulo: datos.titulo,
      empresa: getEmpresa(db, ctx.empresaId) ?? {},
      generadoEn: new Date().toISOString(),
      filtro: input.filtro ?? {},
      columnas: datos.columnas,
      filas: datos.filas,
      totales: datos.totales,
      registros: datos.registros,
      aviso: esLibro
        ? 'Borrador local preparado para e-CF; no constituye certificación DGII.'
        : 'Informe generado desde datos reales de SQLite.'
    }
  }

  return { indicadores, serie, datosReporte, exportar, imprimir }
}

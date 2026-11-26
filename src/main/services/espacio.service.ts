import type { Db } from '../db/connection'
import type { SessionContext } from './context'
import { requirePermission } from './context'
import { camel } from '../repositories/ventas.repo'
import { writeAudit } from '../repositories/auditoria.repo'
import { createAjustesService } from './ajustes.service'
import { errors } from '@shared/errors'
import { permissionKeys } from '@shared/permissions'
import {
  espacioComprobanteEmitirSchema,
  espacioComprobantesFiltroSchema,
  espacioFiltroSchema,
  espacioPresetIdSchema,
  espacioPresetSchema,
  espacioReindexSchema,
  type EspacioComprobanteEmitir,
  type EspacioComprobantesFiltro,
  type EspacioFiltro
} from '@shared/schemas/espacio'

type Fila = Record<string, unknown>
const n = (fila: Fila | undefined, clave: string): number => Number(fila?.[clave] ?? 0)
const txt = (fila: Fila | undefined, clave: string): string => String(fila?.[clave] ?? '')
const hoy = (): string => new Date().toISOString().slice(0, 10)

const ventaTipos = `'FACTURA_CONTADO','FACTURA_CREDITO','POS','NOTA_CREDITO','DEVOLUCION_VENTA','NOTA_DEBITO'`
const signoVenta = `CASE WHEN tipo IN ('NOTA_CREDITO','DEVOLUCION_VENTA') THEN -total_cent ELSE total_cent END`
const compraTipos = `'FACTURA_COMPRA','DEVOLUCION_COMPRA'`
const signoCompra = `CASE WHEN tipo = 'DEVOLUCION_COMPRA' THEN -total_cent ELSE total_cent END`

function rango(filtro: EspacioFiltro): { desde: string; hasta: string } {
  const hasta = filtro.fechaHasta || hoy()
  let desde: string
  if (filtro.periodo === 'PERSONALIZADO') {
    desde = filtro.fechaDesde || `${hasta.slice(0, 4)}-01-01`
  } else if (filtro.periodo === 'MES') {
    desde = `${hasta.slice(0, 7)}-01`
  } else if (filtro.periodo === 'TRIMESTRE') {
    const fecha = new Date(`${hasta}T00:00:00Z`)
    fecha.setUTCMonth(fecha.getUTCMonth() - 2)
    fecha.setUTCDate(1)
    desde = fecha.toISOString().slice(0, 10)
  } else {
    desde = `${hasta.slice(0, 4)}-01-01`
  }
  if (desde > hasta) throw errors.validation('La fecha inicial no puede ser posterior a la final.')
  return { desde, hasta }
}

/** Servicio del Espacio de trabajo: solo consulta datos reales y audita sus escrituras. */
export function createEspacioService(db: Db) {
  function uno(sql: string, ...args: unknown[]): Fila | undefined {
    return db.prepare(sql).get(...args) as Fila | undefined
  }
  function todos(sql: string, ...args: unknown[]): Fila[] {
    return db.prepare(sql).all(...args) as Fila[]
  }
  function suma(sql: string, ...args: unknown[]): number {
    return n(uno(sql, ...args), 'total')
  }
  function audit(
    ctx: SessionContext, operacion: string, entidad: string, id: string | number | null,
    antes: unknown, despues: unknown
  ): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  function resumen(ctx: SessionContext, entrada: unknown): Record<string, unknown> {
    requirePermission(ctx, 'espacio.consultar')
    const filtro = espacioFiltroSchema.parse(entrada ?? {})
    const { desde, hasta } = rango(filtro)
    const empresaId = ctx.empresaId
    const almacen = filtro.almacenId ? ' AND almacen_id = ?' : ''
    const argsAlmacen = filtro.almacenId ? [filtro.almacenId] : []
    const rangoSql = 'date(fecha) BETWEEN ? AND ?'
    const argsRango = [empresaId, desde, hasta, ...argsAlmacen]

    const ventasCent = suma(`
      SELECT COALESCE(SUM(${signoVenta}), 0) AS total FROM documentos_venta
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
         AND tipo IN (${ventaTipos})${almacen}`, ...argsRango)
    const comprasCent = suma(`
      SELECT COALESCE(SUM(${signoCompra}), 0) AS total FROM documentos_compra
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
         AND tipo IN (${compraTipos})${almacen}`, ...argsRango)
    const cobrosCent = suma(`
      SELECT COALESCE(SUM(monto_cent), 0) AS total FROM cxc_recibos
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'`, empresaId, desde, hasta)
    const pagosCent = suma(`
      SELECT COALESCE(SUM(monto_cent), 0) AS total FROM cxp_pagos
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'`, empresaId, desde, hasta)
    const cxcSaldoCent = suma(`
      SELECT COALESCE(SUM(saldo_cent), 0) AS total FROM cxc_documentos
       WHERE empresa_id = ? AND estado <> 'ANULADO'`, empresaId)
    const cxpSaldoCent = suma(`
      SELECT COALESCE(SUM(saldo_cent), 0) AS total FROM cxp_documentos
       WHERE empresa_id = ? AND estado <> 'ANULADO'`, empresaId)
    const documentosVenta = suma(`
      SELECT COUNT(*) AS total FROM documentos_venta
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
         AND tipo IN (${ventaTipos})${almacen}`, ...argsRango)
    const documentosCompra = suma(`
      SELECT COUNT(*) AS total FROM documentos_compra
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
         AND tipo IN (${compraTipos})${almacen}`, ...argsRango)

    const granularidad = filtro.periodo === 'MES' ||
      (filtro.periodo === 'PERSONALIZADO' && (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) <= 45 * 86_400_000)
      ? 'DIA' : 'MES'
    const claveFecha = granularidad === 'DIA' ? 'date(fecha)' : 'substr(fecha, 1, 7)'
    const serie = new Map<string, { clave: string; ventasCent: number; comprasCent: number }>()
    const asegurar = (clave: string) => {
      let fila = serie.get(clave)
      if (!fila) {
        fila = { clave, ventasCent: 0, comprasCent: 0 }
        serie.set(clave, fila)
      }
      return fila
    }
    for (const fila of todos(`
      SELECT ${claveFecha} AS clave, COALESCE(SUM(${signoVenta}), 0) AS total
        FROM documentos_venta
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
         AND tipo IN (${ventaTipos})${almacen}
       GROUP BY ${claveFecha} ORDER BY clave`, ...argsRango)) {
      asegurar(txt(fila, 'clave')).ventasCent = n(fila, 'total')
    }
    for (const fila of todos(`
      SELECT ${claveFecha} AS clave, COALESCE(SUM(${signoCompra}), 0) AS total
        FROM documentos_compra
       WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
         AND tipo IN (${compraTipos})${almacen}
       GROUP BY ${claveFecha} ORDER BY clave`, ...argsRango)) {
      asegurar(txt(fila, 'clave')).comprasCent = n(fila, 'total')
    }

    const umbral = createAjustesService(db).leerGrupo(empresaId, 'alertas').stockBajoUmbral
    const detalle: Record<string, unknown> = {}
    if (filtro.vista === 'GENERAL' || filtro.vista === 'VENTAS') {
      detalle.topProductos = todos(`
        SELECT p.descripcion AS nombre, SUM(l.total_cent) AS totalCent, SUM(l.cantidad) AS unidades
          FROM documento_venta_lineas l
          JOIN documentos_venta d ON d.id = l.doc_id
          JOIN productos p ON p.id = l.producto_id
         WHERE d.empresa_id = ? AND ${rangoSql.replace('fecha', 'd.fecha')}
           AND d.estado <> 'ANULADO' AND d.tipo IN (${ventaTipos})${almacen.replace('almacen_id', 'd.almacen_id')}
         GROUP BY p.id ORDER BY totalCent DESC LIMIT 6`, ...argsRango)
        .map((fila) => ({ nombre: txt(fila, 'nombre'), totalCent: n(fila, 'totalCent'), unidades: n(fila, 'unidades') }))
    }
    if (filtro.vista === 'GENERAL' || filtro.vista === 'COMPRAS') {
      detalle.topProveedores = todos(`
        SELECT proveedor_nombre AS nombre, SUM(${signoCompra}) AS totalCent, COUNT(*) AS documentos
          FROM documentos_compra
         WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
           AND tipo IN (${compraTipos})${almacen}
         GROUP BY proveedor_id ORDER BY totalCent DESC LIMIT 6`, ...argsRango)
        .map((fila) => ({ nombre: txt(fila, 'nombre'), totalCent: n(fila, 'totalCent'), documentos: n(fila, 'documentos') }))
    }
    if (filtro.vista === 'GENERAL' || filtro.vista === 'INVENTARIO') {
      detalle.stockBajo = todos(`
        SELECT p.codigo, p.descripcion, e.cantidad, e.valor_cent AS valorCent
          FROM existencias e JOIN productos p ON p.id = e.producto_id
         WHERE e.empresa_id = ? AND e.cantidad <= ?
         ORDER BY e.cantidad ASC LIMIT 8`, empresaId, umbral)
        .map((fila) => camel(fila))
    }
    if (filtro.vista === 'GENERAL' || filtro.vista === 'FINANZAS') {
      detalle.vencimientos = todos(`
        SELECT 'CXC' AS origen, cl.nombre AS entidad, c.numero_documento AS numero,
               c.saldo_cent AS saldoCent, c.vencimiento
          FROM cxc_documentos c
          JOIN clientes cl ON cl.id = c.cliente_id
         WHERE c.empresa_id = ? AND c.estado = 'PENDIENTE' AND c.saldo_cent > 0
           AND date(COALESCE(NULLIF(c.vencimiento, ''), c.fecha)) < date(?)
         UNION ALL
        SELECT 'CXP' AS origen, COALESCE(NULLIF(p.nombre_comercial, ''), p.razon_social) AS entidad, numero_documento AS numero,
               saldo_cent AS saldoCent, vencimiento
          FROM cxp_documentos c
          JOIN proveedores p ON p.id = c.proveedor_id
         WHERE c.empresa_id = ? AND c.estado = 'PENDIENTE' AND c.saldo_cent > 0
           AND date(COALESCE(NULLIF(c.vencimiento, ''), c.fecha)) < date(?)
         ORDER BY vencimiento ASC LIMIT 8`, empresaId, hasta, empresaId, hasta)
        .map((fila) => camel(fila))
    }

    const utilidadCent = ctx.permisos.includes('reportes.ganancia')
      ? suma(`
          SELECT COALESCE(SUM(total_cent - costo_total_cent), 0) AS total FROM documentos_venta
           WHERE empresa_id = ? AND ${rangoSql} AND estado <> 'ANULADO'
             AND tipo IN ('FACTURA_CONTADO','FACTURA_CREDITO','POS')${almacen}`, ...argsRango)
      : null

    return {
      filtro: { ...filtro, desde, hasta, granularidad },
      kpis: {
        ventasCent, comprasCent, cobrosCent, pagosCent, cxcSaldoCent, cxpSaldoCent,
        documentosVenta, documentosCompra, ticketPromedioCent: documentosVenta
          ? Math.round(ventasCent / documentosVenta) : 0,
        utilidadCent
      },
      serie: [...serie.values()].sort((a, b) => a.clave.localeCompare(b.clave)),
      detalle
    }
  }

  function consultarComprobantes(filtro: EspacioComprobantesFiltro, empresaId: number): Fila[] {
    const origen = filtro.origen
    const entidad = origen === 'venta' ? 'cliente_nombre' : 'proveedor_nombre'
    const rnc = origen === 'venta' ? 'cliente_rnc' : 'proveedor_rnc'
    const tabla = origen === 'venta' ? 'documentos_venta' : 'documentos_compra'
    const docFactura = origen === 'venta' ? 'numero' : 'numero_proveedor'
    const condiciones = ['empresa_id = ?']
    const args: unknown[] = [empresaId]
    if (filtro.tipo) { condiciones.push('tipo = ?'); args.push(filtro.tipo) }
    if (filtro.estado) { condiciones.push('estado = ?'); args.push(filtro.estado) }
    if (filtro.fechaDesde) { condiciones.push('date(fecha) >= date(?)'); args.push(filtro.fechaDesde) }
    if (filtro.fechaHasta) { condiciones.push('date(fecha) <= date(?)'); args.push(filtro.fechaHasta) }
    if (filtro.texto) {
      const patron = `%${filtro.texto.replace(/[\\%_]/g, '\\$&')}%`
      condiciones.push(`(numero LIKE ? ESCAPE '\\' OR ${docFactura} LIKE ? ESCAPE '\\' OR ${entidad} LIKE ? ESCAPE '\\' OR ${rnc} LIKE ? ESCAPE '\\')`)
      args.push(patron, patron, patron, patron)
    }
    const origenLiteral = origen === 'venta' ? "'venta'" : "'compra'"
    const moneda = origen === 'compra'
      ? 'moneda_codigo AS monedaCodigo, tasa_aplicada AS tasaAplicada'
      : "'DOP' AS monedaCodigo, 1 AS tasaAplicada"
    return todos(`
      SELECT id, ${origenLiteral} AS origen, tipo, numero, ${docFactura} AS numeroFactura,
             fecha, vencimiento, estado, condicion, ${entidad} AS entidad, ${rnc} AS entidadRnc,
             total_cent AS totalCent, impuesto_cent AS impuestoCent, ${moneda}
        FROM ${tabla}
       WHERE ${condiciones.join(' AND ')}
       ORDER BY date(fecha) DESC, id DESC LIMIT ?`, ...args, filtro.limite)
  }

  function comprobantes(ctx: SessionContext, entrada: unknown): Record<string, unknown> {
    requirePermission(ctx, 'espacio.consultar')
    const filtro = espacioComprobantesFiltroSchema.parse(entrada ?? {})
    return {
      filtro,
      filas: consultarComprobantes(filtro, ctx.empresaId).map((fila) => camel(fila))
    }
  }

  function exportar(ctx: SessionContext, entrada: unknown): Record<string, unknown> {
    requirePermission(ctx, 'espacio.exportar')
    const solicitado = espacioComprobantesFiltroSchema.parse(entrada ?? {})
    const filtro = { ...solicitado, limite: 1000 }
    const filas = consultarComprobantes(filtro, ctx.empresaId)
    const cabeceras = ['Origen', 'Tipo', 'Número', 'Factura/NCF', 'Fecha', 'Vencimiento', 'Estado', 'Condición', 'Entidad', 'RNC', 'Total', 'ITBIS', 'Moneda', 'Tasa']
    const escapar = (valor: unknown): string => `"${String(valor ?? '').replace(/"/g, '""')}"`
    const lineas = [cabeceras.map(escapar).join(',')]
    for (const fila of filas) {
      lineas.push([
        fila.origen, fila.tipo, fila.numero, fila.numeroFactura, fila.fecha, fila.vencimiento,
        fila.estado, fila.condicion, fila.entidad, fila.entidadRnc,
        (n(fila, 'totalCent') / 100).toFixed(2), (n(fila, 'impuestoCent') / 100).toFixed(2),
        fila.monedaCodigo, fila.tasaAplicada
      ].map(escapar).join(','))
    }
    const csv = `\uFEFF${lineas.join('\r\n')}`
    db.transaction(() => {
      audit(ctx, 'EXPORTAR', 'espacio_comprobantes', null, filtro, { registros: filas.length })
    })()
    return {
      filename: `espacio-comprobantes-${hoy()}.csv`,
      base64: Buffer.from(csv, 'utf8').toString('base64'),
      mime: 'text/csv',
      registros: filas.length
    }
  }

  function diagnosticar(ctx: SessionContext): Record<string, unknown> {
    requirePermission(ctx, 'espacio.consultar')
    const integridad = db.pragma('integrity_check') as Fila[]
    const estadoIntegridad = integridad.length === 1 && txt(integridad[0], Object.keys(integridad[0])[0] ?? '') === 'ok'
    const foraneas = db.pragma('foreign_key_check') as Fila[]
    const migraciones = todos('SELECT version, nombre, aplicada_en FROM _migraciones ORDER BY version')
    const versiones = migraciones.map((m) => n(m, 'version'))
    const esperadas = 14
    const faltan = Array.from({ length: esperadas }, (_, i) => i + 1).filter((v) => !versiones.includes(v))
    const enCatalogo = new Set((db.prepare('SELECT clave FROM permisos').all() as Fila[]).map((f) => txt(f, 'clave')))
    const permisosFaltantes = permissionKeys.filter((clave) => !enCatalogo.has(clave))
    const conAcceso = suma(`
      SELECT COUNT(DISTINCT r.id) AS total FROM roles r
        JOIN rol_permisos rp ON rp.rol_id = r.id
        JOIN permisos p ON p.id = rp.permiso_id
       WHERE p.clave = 'espacio.consultar'`)
    const ultimaAuditoria = uno('SELECT fecha, operacion, entidad FROM auditoria WHERE empresa_id = ? ORDER BY id DESC LIMIT 1', ctx.empresaId)

    const comprobaciones = [
      {
        nombre: 'Integridad SQLite',
        estado: estadoIntegridad ? 'ok' : 'error',
        detalle: estadoIntegridad ? 'integrity_check: ok' : 'integrity_check detectó inconsistencias.'
      },
      {
        nombre: 'Claves foráneas',
        estado: foraneas.length === 0 ? 'ok' : 'error',
        detalle: foraneas.length === 0 ? 'Sin referencias huérfanas.' : `${foraneas.length} referencia(s) huérfana(s).`
      },
      {
        nombre: 'Migraciones',
        estado: faltan.length === 0 ? 'ok' : 'error',
        detalle: faltan.length === 0
          ? `${versiones.length} migraciones aplicadas (última ${Math.max(0, ...versiones)}).`
          : `Faltan migraciones: ${faltan.join(', ')}.`
      },
      {
        nombre: 'Catálogo de permisos',
        estado: permisosFaltantes.length === 0 ? 'ok' : 'advertencia',
        detalle: permisosFaltantes.length === 0
          ? `${permissionKeys.length} permisos del catálogo presentes.`
          : `${permisosFaltantes.length} permiso(s) ausente(s): ${permisosFaltantes.slice(0, 6).join(', ')}.`
      },
      {
        nombre: 'Acceso al espacio',
        estado: conAcceso > 0 ? 'ok' : 'advertencia',
        detalle: conAcceso > 0 ? `${conAcceso} rol(es) pueden abrir el espacio.` : 'Ningún rol tiene espacio.consultar.'
      }
    ]
    return {
      calculadoEn: new Date().toISOString(),
      calificacion: comprobaciones.some((c) => c.estado === 'error') ? 'error'
        : comprobaciones.some((c) => c.estado === 'advertencia') ? 'advertencia' : 'ok',
      comprobaciones,
      base: {
        paginas: Number(db.pragma('page_count', { simple: true })),
        paginasLibres: Number(db.pragma('freelist_count', { simple: true })),
        tamanoPagina: Number(db.pragma('page_size', { simple: true })),
        migraciones: versiones.length,
        ultimaMigracion: Math.max(0, ...versiones)
      },
      datos: {
        productos: suma('SELECT COUNT(*) AS total FROM productos WHERE empresa_id = ?', ctx.empresaId),
        clientes: suma('SELECT COUNT(*) AS total FROM clientes WHERE empresa_id = ?', ctx.empresaId),
        proveedores: suma('SELECT COUNT(*) AS total FROM proveedores WHERE empresa_id = ?', ctx.empresaId),
        documentosVenta: suma('SELECT COUNT(*) AS total FROM documentos_venta WHERE empresa_id = ?', ctx.empresaId),
        documentosCompra: suma('SELECT COUNT(*) AS total FROM documentos_compra WHERE empresa_id = ?', ctx.empresaId),
        comprobantesEmitidos: suma('SELECT COUNT(*) AS total FROM espacio_emisiones WHERE empresa_id = ?', ctx.empresaId),
        plantillas: suma('SELECT COUNT(*) AS total FROM espacio_presets WHERE empresa_id = ?', ctx.empresaId)
      },
      ultimaAuditoria: ultimaAuditoria ? camel(ultimaAuditoria) : null
    }
  }

  function reindexar(ctx: SessionContext, entrada: unknown): Record<string, unknown> {
    requirePermission(ctx, 'espacio.mantenimiento')
    espacioReindexSchema.parse(entrada)
    const antes = Number(db.pragma('freelist_count', { simple: true }))
    const resultado = db.transaction(() => {
      db.exec('REINDEX')
      audit(ctx, 'REINDEX', 'espacio_trabajo', null, { paginasLibres: antes }, {
        paginasLibres: Number(db.pragma('freelist_count', { simple: true }))
      })
      return true
    })()
    return {
      ok: resultado,
      paginasLibresAntes: antes,
      paginasLibresDespues: Number(db.pragma('freelist_count', { simple: true }))
    }
  }

  function listarPresets(ctx: SessionContext): Record<string, unknown> {
    requirePermission(ctx, 'espacio.consultar')
    return {
      plantillas: todos('SELECT * FROM espacio_presets WHERE empresa_id = ? ORDER BY id DESC', ctx.empresaId)
        .map((fila) => {
          let settings: unknown = {}
          let ajustes: unknown = {}
          try { settings = JSON.parse(txt(fila, 'settings_json')) } catch { settings = {} }
          try { ajustes = JSON.parse(txt(fila, 'ajustes_json')) } catch { ajustes = {} }
          return { ...camel(fila), settings, ajustes }
        })
    }
  }

  function guardarPreset(ctx: SessionContext, entrada: unknown): Record<string, unknown> {
    requirePermission(ctx, 'espacio.modificar')
    const input = espacioPresetSchema.parse(entrada)
    const settingsJson = JSON.stringify(input.settings)
    const ajustesJson = JSON.stringify(input.ajustes)
    const id = db.transaction(() => {
      if (input.id) {
        const anterior = uno('SELECT * FROM espacio_presets WHERE id = ? AND empresa_id = ?', input.id, ctx.empresaId)
        if (!anterior) throw errors.notFound('Plantilla')
        db.prepare(`
          UPDATE espacio_presets
             SET nombre = ?, descripcion = ?, settings_json = ?, ajustes_json = ?,
                 usuario_id = ?, actualizado_en = datetime('now')
           WHERE id = ? AND empresa_id = ?
        `).run(input.nombre, input.descripcion, settingsJson, ajustesJson, ctx.userId, input.id, ctx.empresaId)
        audit(ctx, 'MODIFICAR', 'espacio_presets', input.id, anterior, input)
        return input.id
      }
      const resultado = db.prepare(`
        INSERT INTO espacio_presets
          (empresa_id, nombre, descripcion, settings_json, ajustes_json, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(empresa_id, nombre) DO UPDATE SET
          descripcion = excluded.descripcion, settings_json = excluded.settings_json,
          ajustes_json = excluded.ajustes_json, usuario_id = excluded.usuario_id,
          actualizado_en = datetime('now')
      `).run(ctx.empresaId, input.nombre, input.descripcion, settingsJson, ajustesJson, ctx.userId)
      const guardado = Number(resultado.lastInsertRowid)
      audit(ctx, 'CREAR', 'espacio_presets', guardado, null, {
        nombre: input.nombre, descripcion: input.descripcion
      })
      return guardado
    })()
    return { id }
  }

  function eliminarPreset(ctx: SessionContext, entrada: unknown): Record<string, unknown> {
    requirePermission(ctx, 'espacio.modificar')
    const { id } = espacioPresetIdSchema.parse(entrada)
    db.transaction(() => {
      const anterior = uno('SELECT * FROM espacio_presets WHERE id = ? AND empresa_id = ?', id, ctx.empresaId)
      if (!anterior) throw errors.notFound('Plantilla')
      db.prepare('DELETE FROM espacio_presets WHERE id = ? AND empresa_id = ?').run(id, ctx.empresaId)
      audit(ctx, 'ELIMINAR', 'espacio_presets', id, anterior, null)
    })()
    return { ok: true }
  }

  function registrarEmision(
    ctx: SessionContext, entrada: EspacioComprobanteEmitir, archivo: { filename: string; base64: string }
  ): Record<string, unknown> {
    requirePermission(ctx, 'espacio.imprimir')
    const input = espacioComprobanteEmitirSchema.parse(entrada)
    const tabla = input.origen === 'venta' ? 'documentos_venta' : 'documentos_compra'
    const documento = uno(`SELECT id, numero, total_cent AS totalCent FROM ${tabla} WHERE id = ? AND empresa_id = ?`, input.id, ctx.empresaId)
    if (!documento) throw errors.notFound('Documento')
    const id = db.transaction(() => {
      const resultado = db.prepare(`
        INSERT INTO espacio_emisiones
          (empresa_id, origen, documento_id, numero, formato, motivo, usuario_id, sesion_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ctx.empresaId, input.origen, input.id, txt(documento, 'numero'), input.formato, input.motivo, ctx.userId, ctx.sesionId)
      const emitido = Number(resultado.lastInsertRowid)
      audit(ctx, 'EMITIR_COMPROBANTE', 'espacio_emisiones', emitido, null, {
        origen: input.origen, documentoId: input.id, formato: input.formato,
        motivo: input.motivo, archivo: archivo.filename
      })
      return emitido
    })()
    return { id }
  }

  function historialEmisiones(ctx: SessionContext): Record<string, unknown> {
    requirePermission(ctx, 'espacio.consultar')
    return {
      emisiones: todos(`
        SELECT * FROM espacio_emisiones WHERE empresa_id = ? ORDER BY id DESC LIMIT 80`, ctx.empresaId)
        .map((fila) => camel(fila))
    }
  }

  return {
    resumen,
    comprobantes,
    exportar,
    diagnosticar,
    reindexar,
    listarPresets,
    guardarPreset,
    eliminarPreset,
    registrarEmision,
    historialEmisiones
  }
}

import * as pdfMakeModule from 'pdfmake/build/pdfmake.js'
import * as pdfFontsModule from 'pdfmake/build/vfs_fonts.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { defaultSettings, type Settings } from '@shared/settings'
import { defaultAjustes, type Ajustes } from '@shared/schemas/ajustes'
import { errors } from '@shared/errors'
import type { Db } from '../db/connection'
import { writeAudit } from '../repositories/auditoria.repo'
import * as seguridadRepo from '../repositories/seguridad.repo'
import { leerPreferenciasEstacion } from './backups.service'
import { createAjustesService } from './ajustes.service'
import { formatosBackendExportacion, libroHabilitado, resolverImpresoraTicket } from './configuracion.service'
import { requirePermission, type SessionContext } from './context'
import type { PdfGenerarInput } from '@shared/schemas/pdf'
import { reportesImprimirSchema } from '@shared/schemas/reportes'

/**
 * PDF real generado con pdfmake en el proceso principal.
 * Los datos nunca los elige el renderer: se obtienen de los servicios que ya
 * verifican permisos, empresa y existencia de cada documento.
 */
type Fila = Record<string, unknown>
type Contenido = Record<string, unknown>

interface PdfMake {
  addVirtualFileSystem(vfs: Record<string, string>): void
  createPdf(definicion: Contenido): { getBuffer(): Promise<Buffer> }
}

/** Según el entorno (Node, Vite o Electron) el módulo puede venir bajo `default`. */
function normalizar<T>(modulo: unknown): T {
  const candidato = modulo as { default?: unknown }
  return (candidato?.default ?? modulo) as T
}

const pdfMake = normalizar<PdfMake>(pdfMakeModule)
const vfs = normalizar<Record<string, string>>(pdfFontsModule)
pdfMake.addVirtualFileSystem(vfs)

type Imprimir = (ctx: SessionContext, input: never) => Fila

/** Preferencias efectivas que el backend aplica al construir el PDF. */
export interface PreferenciasImpresionPdf {
  incluirLogo: boolean
  incluirPie: boolean
  copias: number
  margenMm: number
  impresora: string
  formatos: readonly string[]
  carpetaExportacion: string
  impresoraTicket: string
  exportacionAutomatica: boolean
}

export interface DependenciasPdf {
  db?: Db
  userDataPath?: string
  leerSettings?: () => Settings
}

/** Una carpeta relativa bajo `userData`; nunca se acepta una ruta absoluta. */
export function resolverCarpetaExportacion(userDataPath: string, configurada: string): string {
  const nombre = configurada.trim()
  if (!nombre || isAbsolute(nombre)) {
    throw errors.validation('La carpeta de exportación debe ser un nombre relativo.')
  }
  if (!/^[A-Za-z0-9_-]+$/.test(nombre)) {
    throw errors.validation('La carpeta de exportación solo admite letras, números, guiones y guiones bajos.')
  }
  const base = resolve(userDataPath)
  const destino = resolve(base, nombre)
  const relativo = relative(base, destino)
  if (!relativo || relativo.startsWith('..') || isAbsolute(relativo) || relativo.includes(sep + '..')) {
    throw errors.validation('La carpeta de exportación debe estar dentro de userData.')
  }
  mkdirSync(destino, { recursive: true })
  return destino
}

/** pdfmake trabaja en puntos: 1 mm = 72 / 25.4 pt. */
export function mmAPuntos(milimetros: number): number {
  return (Number.isFinite(milimetros) ? Math.max(0, milimetros) : 12) * 72 / 25.4
}

function integracionesPorDefecto(): Ajustes['integraciones'] {
  return defaultAjustes.integraciones
}

export function preferenciasImpresionPdf(
  deps: DependenciasPdf = {}, ctx?: SessionContext
): PreferenciasImpresionPdf {
  const settings = deps.leerSettings
    ? deps.leerSettings()
    : deps.userDataPath ? leerPreferenciasEstacion(deps.userDataPath) : { ...defaultSettings }
  const integraciones = deps.db && ctx
    ? createAjustesService(deps.db).leerGrupo(ctx.empresaId, 'integraciones')
    : integracionesPorDefecto()
  return {
    incluirLogo: settings.impresion.incluirLogo,
    incluirPie: settings.impresion.incluirPie,
    copias: settings.impresion.copias,
    margenMm: settings.impresion.margenMm,
    impresora: settings.impresion.impresora,
    formatos: formatosBackendExportacion.filter((formato) => integraciones.formatos.includes(formato)),
    carpetaExportacion: integraciones.carpetaExportacion,
    impresoraTicket: deps.db && ctx
      ? resolverImpresoraTicket(deps.db, ctx.empresaId, { integraciones })
      : integraciones.impresoraTicket,
    exportacionAutomatica: integraciones.exportacionAutomatica
  }
}

export interface FuentesPdf {
  ventas: { datosImpresion: Imprimir }
  compras: { datosImpresion: Imprimir }
  finanzas: {
    cxcImprimir: Imprimir
    cxpImprimir: Imprimir
    bancosImprimir: Imprimir
    cajasImprimir: Imprimir
  }
  cobros: { imprimir: Imprimir }
  reportes: { imprimir: Imprimir }
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  return ''
}

/** Los importes viajan en centavos; aquí se muestran en RD$ sin alterar la BD. */
function mostrar(clave: string, valor: unknown): string {
  if (clave.endsWith('Cent') && typeof valor === 'number' && Number.isFinite(valor)) {
    return `RD$ ${(valor / 100).toLocaleString('es-DO', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`
  }
  return texto(valor)
}

function campo(fila: Fila, claves: string[]): string {
  for (const clave of claves) {
    const valor = fila[clave]
    if (valor !== undefined && valor !== null && valor !== '') return mostrar(clave, valor)
  }
  return ''
}

function humano(clave: string): string {
  return clave
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/Cent$/, '')
    .replace(/^./, (c) => c.toUpperCase())
}

function encabezado(empresa: Fila): Contenido[] {
  const nombre = campo(empresa, ['nombreComercial', 'nombre_comercial', 'razonSocial', 'razon_social'])
  const razon = campo(empresa, ['razonSocial', 'razon_social'])
  const rnc = campo(empresa, ['rnc', 'cedula'])
  const direccion = campo(empresa, ['direccion', 'direccionFiscal'])
  return [
    { text: nombre || 'ENTERPRISE PRO ERP', style: 'titulo', alignment: 'center' },
    ...(razon && razon !== nombre ? [{ text: razon, alignment: 'center' as const, fontSize: 9 }] : []),
    {
      text: [rnc ? `RNC/Cédula: ${rnc}` : '', direccion].filter(Boolean).join(' · '),
      alignment: 'center', fontSize: 8, margin: [0, 2, 0, 8]
    }
  ]
}

function tabla(filas: Fila[], preferidas: { clave: string; titulo: string }[]): Contenido {
  if (!filas.length) return { text: 'Sin líneas registradas.', italics: true, fontSize: 9 }
  const columnas = preferidas.filter((c) => filas.some((fila) => fila[c.clave] !== undefined))
  const usadas = columnas.length
    ? columnas
    : Object.keys(filas[0])
      .filter((clave) => clave !== 'id' && !clave.startsWith('costo'))
      .slice(0, 6)
      .map((clave) => ({ clave, titulo: humano(clave) }))
  if (!usadas.length) return { text: 'Sin líneas registradas.', italics: true, fontSize: 9 }
  const body = [
    usadas.map((c) => ({ text: c.titulo, bold: true, fontSize: 8 })),
    ...filas.map((fila) => usadas.map((c) => ({ text: mostrar(c.clave, fila[c.clave]) || '—', fontSize: 8 })))
  ]
  return { table: { headerRows: 1, widths: usadas.map((_, i) => i === 0 ? '*' : 'auto'), body }, layout: 'lightLines' }
}

function metaDocumento(documento: Fila): Contenido {
  const pares: [string, string][] = [
    ['Tipo', campo(documento, ['tipo'])],
    ['Número', campo(documento, ['numero', 'numeroDocumento', 'numeroFactura', 'numeroInterno'])],
    ['NCF', Number(documento.esNcf ?? 0) === 1 ? 'Sí' : ''],
    ['Fecha', campo(documento, ['fecha', 'fechaEmision', 'fechaApertura'])],
    ['Vencimiento', campo(documento, ['vencimiento'])],
    ['Estado', campo(documento, ['estado'])],
    ['Condición', campo(documento, ['condicion'])],
    ['Cliente', campo(documento, ['clienteNombre', 'entidadNombre', 'proveedorNombre', 'nombre'])],
    ['RNC/Cédula', campo(documento, ['clienteRnc', 'entidadRnc', 'proveedorRnc', 'rnc'])],
    ['Vendedor', campo(documento, ['vendedorNombre'])],
    ['Almacén', campo(documento, ['almacenNombre'])],
    ['Caja', campo(documento, ['cajaNombre', 'cajaCodigo'])],
    ['Cuenta', campo(documento, ['cuentaNombre', 'cuentaNumero'])],
    ['Observaciones', campo(documento, ['comentarios', 'observaciones', 'motivo'])]
  ].filter(([, valor]) => !!valor) as [string, string][]
  if (!pares.length) return { text: '' }
  return {
    columns: pares.map(([etiqueta, valor]) => ({
      text: `${etiqueta}: ${valor}`, fontSize: 9, margin: [0, 1, 8, 1]
    })),
    columnGap: 6,
    margin: [0, 0, 0, 10]
  }
}

function totales(documento: Fila): Contenido {
  const pares: [string, string][] = [
    ['Subtotal', campo(documento, ['subtotalCent', 'subtotal'])],
    ['Descuento', campo(documento, ['descuentoCent', 'descuento'])],
    ['ITBIS', campo(documento, ['impuestoCent', 'impuesto', 'itbisCent'])],
    ['Total', campo(documento, ['totalCent', 'total', 'montoCent', 'saldoCent'])],
    ['Efectivo', campo(documento, ['efectivoCent'])]
  ].filter(([, valor]) => !!valor) as [string, string][]
  if (!pares.length) return { text: '' }
  return {
    table: {
      widths: ['*', 110],
      body: pares.map(([etiqueta, valor], i) => ([
        { text: etiqueta, bold: i === pares.length - 1, alignment: 'right' as const },
        { text: valor, bold: i === pares.length - 1, alignment: 'right' as const }
      ]))
    },
    layout: 'noBorders',
    margin: [0, 8, 0, 4]
  }
}

function pie(): Contenido {
  return {
    text: 'Documento generado por ENTERPRISE PRO ERP · Uso local · No constituye certificación DGII.',
    alignment: 'center', fontSize: 7, margin: [0, 12, 0, 0]
  }
}

function nombreArchivo(titulo: string): string {
  const fecha = new Date().toISOString().slice(0, 10)
  const limpio = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase().slice(0, 60)
  return `${limpio || 'DOCUMENTO'}_${fecha}.pdf`
}

export function definicionDocumento(
  datos: Fila, formato: string, preferencias: PreferenciasImpresionPdf = preferenciasImpresionPdf()
): Contenido {
  const documento = (datos.documento ?? {}) as Fila
  const empresa = (datos.empresa ?? {}) as Fila
  const lineas = Array.isArray(datos.lineas) ? datos.lineas as Fila[] : []
  const pagos = Array.isArray(datos.pagos) ? datos.pagos as Fila[] : []
  const ticket = formato.startsWith('TICKET')
  const contenido: Contenido[] = [
    ...(preferencias.incluirLogo ? [{ text: '◆ ENTERPRISE PRO ERP', alignment: 'center', fontSize: ticket ? 8 : 11, bold: true }] : []),
    ...encabezado(empresa),
    { text: campo(documento, ['tipo']) || 'DOCUMENTO', style: 'subtitulo', alignment: 'center' },
    metaDocumento(documento),
    tabla(lineas, [
      { clave: 'descripcion', titulo: 'Descripción' }, { clave: 'productoNombre', titulo: 'Producto' },
      { clave: 'cantidad', titulo: 'Cant.' }, { clave: 'precioCent', titulo: 'Precio' },
      { clave: 'impuestoCent', titulo: 'ITBIS' }, { clave: 'totalCent', titulo: 'Total' }
    ]),
    totales(documento)
  ]
  if (pagos.length) {
    contenido.push({ text: 'Pagos', bold: true, margin: [0, 8, 0, 2], fontSize: 9 })
    contenido.push(tabla(pagos, [
      { clave: 'metodo', titulo: 'Método' }, { clave: 'referencia', titulo: 'Referencia' },
      { clave: 'montoCent', titulo: 'Monto' }
    ]))
  }
  if (ticket && preferencias.impresoraTicket) {
    contenido.push({ text: `Impresora: ${preferencias.impresoraTicket}`, alignment: 'center', fontSize: 7 })
  }
  if (preferencias.incluirPie) contenido.push(pie())

  // `copias` de `settings.impresion`: pdfmake no tiene copias nativas, por lo que
  // se repite el contenido con salto de página. Una sola copia no cambia el layout.
  const contenidoFinal: Contenido[] = []
  for (let copia = 1; copia <= Math.max(1, Math.min(5, preferencias.copias)); copia += 1) {
    if (copia > 1) contenidoFinal.push({ text: `Copia ${copia}`, pageBreak: 'before', bold: true, alignment: 'center' })
    contenidoFinal.push(...contenido.map((bloque) => ({ ...bloque })))
  }
  const margen = mmAPuntos(preferencias.margenMm)
  return {
    // pdfmake 0.3 espera puntos numéricos en pageSize; las cadenas "mm" se mutan
    // internamente y rompen el trazo de tablas en tickets.
    pageSize: ticket
      ? { width: formato === 'TICKET_58' ? 164.4 : 226.8, height: 841.9 }
      : formato === 'MEDIA' ? 'LETTER' : 'A4',
    pageMargins: ticket ? [margen, margen, margen, margen] : [margen, margen, margen, margen],
    content: contenidoFinal,
    styles: {
      titulo: { fontSize: ticket ? 12 : 16, bold: true },
      subtitulo: { fontSize: ticket ? 10 : 12, bold: true, alignment: 'center', margin: [0, 0, 0, 8] }
    },
    defaultStyle: { font: 'Roboto', fontSize: ticket ? 8 : 10 }
  }
}

export function definicionReporte(
  datos: Fila, preferencias: PreferenciasImpresionPdf = preferenciasImpresionPdf()
): Contenido {
  const empresa = (datos.empresa ?? {}) as Fila
  const columnas = Array.isArray(datos.columnas) ? datos.columnas as Fila[] : []
  const filas = Array.isArray(datos.filas) ? datos.filas as Fila[] : []
  const totalesDatos = (datos.totales ?? {}) as Fila
  const contenido: Contenido[] = [
    ...(preferencias.incluirLogo ? [{ text: '◆ ENTERPRISE PRO ERP', alignment: 'center', fontSize: 11, bold: true }] : []),
    ...encabezado(empresa),
    { text: texto(datos.titulo) || 'REPORTE', style: 'titulo', alignment: 'center' },
    {
      text: `Generado: ${texto(datos.generadoEn)} · Registros: ${texto(datos.registros)}`,
      alignment: 'center', fontSize: 8, margin: [0, 4, 0, 10]
    }
  ]
  if (columnas.length) {
    contenido.push(tabla(filas, columnas.map((c) => ({
      clave: texto(c.key ?? c.clave), titulo: texto(c.header ?? c.titulo) || humano(texto(c.key ?? c.clave))
    })).filter((c) => !!c.clave)))
  }
  const pares = Object.entries(totalesDatos)
    .filter(([, valor]) => typeof valor === 'number')
    .map(([clave, valor]) => ({ text: `${humano(clave)}: ${mostrar(clave, valor)}`, fontSize: 9, bold: true }))
  if (pares.length) contenido.push({ columns: pares, columnGap: 10, margin: [0, 10, 0, 0] })
  contenido.push({ text: texto(datos.aviso), fontSize: 8, italics: true, margin: [0, 10, 0, 0] })
  if (preferencias.incluirPie) contenido.push(pie())
  const copias = Math.max(1, Math.min(5, preferencias.copias))
  const contenidoFinal: Contenido[] = []
  for (let copia = 1; copia <= copias; copia += 1) {
    if (copia > 1) contenidoFinal.push({ text: `Copia ${copia}`, pageBreak: 'before', bold: true, alignment: 'center' })
    contenidoFinal.push(...contenido.map((bloque) => ({ ...bloque })))
  }
  const margen = mmAPuntos(preferencias.margenMm)
  return {
    pageSize: 'A4',
    pageMargins: [margen, margen, margen, margen],
    content: contenidoFinal,
    styles: { titulo: { fontSize: 14, bold: true } },
    defaultStyle: { font: 'Roboto', fontSize: 9 }
  }
}

export async function generarPdf(
  ctx: SessionContext,
  input: PdfGenerarInput,
  fuentes: FuentesPdf,
  deps: DependenciasPdf = {}
): Promise<{ filename: string; base64: string; mime: string; impresora?: string }> {
  const preferencias = preferenciasImpresionPdf(deps, ctx)
  if (!preferencias.formatos.includes('PDF')) {
    throw errors.validation('El formato PDF no está habilitado en las integraciones de la estación.')
  }
  if (input.origen === 'reporte' && (input.reporte === 'LIBRO606' || input.reporte === 'LIBRO607')) {
    if (deps.db && !libroHabilitado(deps.db, ctx.empresaId, input.reporte)) {
      throw errors.validation(`El libro ${input.reporte} está desactivado en ajustes fiscales.`)
    }
  }
  let datos: Fila
  let titulo: string
  if (input.origen === 'reporte') {
    const solicitud = reportesImprimirSchema.parse({ reporte: input.reporte, filtro: input.filtro })
    datos = fuentes.reportes.imprimir(ctx, solicitud as never)
    titulo = texto(datos.titulo) || 'REPORTE'
  } else {
    const solicitud = { id: input.id, formato: input.formato, tipo: input.tipo }
    if (input.origen === 'venta') datos = fuentes.ventas.datosImpresion(ctx, solicitud as never)
    else if (input.origen === 'compra') datos = fuentes.compras.datosImpresion(ctx, solicitud as never)
    else if (input.origen === 'cxc') datos = fuentes.finanzas.cxcImprimir(ctx, solicitud as never)
    else if (input.origen === 'cobros') datos = fuentes.cobros.imprimir(ctx, solicitud as never)
    else if (input.origen === 'cxp') datos = fuentes.finanzas.cxpImprimir(ctx, solicitud as never)
    else if (input.origen === 'banco') datos = fuentes.finanzas.bancosImprimir(ctx, solicitud as never)
    else datos = fuentes.finanzas.cajasImprimir(ctx, solicitud as never)
    titulo = campo((datos.documento ?? {}) as Fila, ['tipo']) || input.origen.toUpperCase()
  }
  const definicion = input.origen === 'reporte'
    ? definicionReporte(datos, preferencias)
    : definicionDocumento(datos, input.formato, preferencias)
  const buffer = await pdfMake.createPdf(definicion).getBuffer()
  return {
    filename: nombreArchivo(titulo),
    base64: buffer.toString('base64'),
    mime: 'application/pdf',
    impresora: input.formato.startsWith('TICKET') ? preferencias.impresoraTicket || preferencias.impresora : undefined
  }
}

interface FilaExportacionAutomatica {
  id: number
  empresa_id: number
  usuario_id: number | null
  origen: 'venta' | 'compra'
  documento_id: number
}

/** Contexto derivado de la fila: la autorización se comprueba en el backend. */
function contextoExportacion(db: Db, usuarioId: number | null, empresaId: number): SessionContext {
  const usuario = usuarioId ? seguridadRepo.findUserById(db, usuarioId) : undefined
  const permisos = usuario
    ? seguridadRepo.effectivePermissions(db, seguridadRepo.roleIdsForUser(db, usuario.id, empresaId), usuario.id)
      .filter((permiso) => permiso.concedido === 1)
      .map((permiso) => permiso.key)
    : []
  return {
    token: '', sesionId: 0, userId: usuarioId ?? 0, empresaId,
    username: usuario?.username ?? 'SISTEMA', nombre: usuario?.nombre ?? 'SISTEMA',
    empresaNombre: '', debeCambiarClave: false, permisos
  }
}

function datosDocumentoExportado(db: Db, origen: 'venta' | 'compra', documentoId: number): Fila | null {
  const tabla = origen === 'venta' ? 'documentos_venta' : 'documentos_compra'
  const tablaLineas = origen === 'venta' ? 'documento_venta_lineas' : 'documento_compra_lineas'
  const documento = db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(documentoId) as Fila | undefined
  if (!documento) return null
  const lineas = db.prepare(`SELECT * FROM ${tablaLineas} WHERE doc_id = ? ORDER BY id`).all(documentoId) as Fila[]
  const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(documento.empresa_id) as Fila | undefined
  return { documento, lineas, empresa: empresa ?? {}, pagos: [] }
}

function marcarExportacion(
  db: Db, fila: FilaExportacionAutomatica, estado: string, operacion: string, detalle: unknown
): void {
  db.transaction(() => {
    db.prepare('UPDATE exportaciones_automaticas SET estado = ? WHERE id = ?').run(estado, fila.id)
    writeAudit(db, {
      empresaId: fila.empresa_id,
      userId: fila.usuario_id ?? (null as unknown as number),
      sesionId: null
    }, operacion, 'exportaciones_automaticas', fila.id, null, detalle)
  })()
}

/**
 * Procesa la cola creada por los disparadores al guardar documentos. Solo genera
 * el archivo si `exportacionAutomatica` está activa y el usuario que guardó tiene
 * `reportes.exportar`; cada decisión queda auditada. La generación del PDF y la
 * escritura del archivo se hacen FUERA de una transacción de base de datos.
 */
export async function procesarExportacionesAutomaticas(db: Db, userDataPath: string): Promise<number> {
  const pendientes = db.prepare(`
    SELECT id, empresa_id, usuario_id, origen, documento_id
      FROM exportaciones_automaticas WHERE estado = 'PENDIENTE' ORDER BY id LIMIT 20
  `).all() as FilaExportacionAutomatica[]
  let procesadas = 0
  for (const fila of pendientes) {
    const ctx = contextoExportacion(db, fila.usuario_id, fila.empresa_id)
    const preferencias = preferenciasImpresionPdf({ db, userDataPath }, ctx)
    if (!preferencias.exportacionAutomatica || !preferencias.formatos.includes('PDF')) {
      marcarExportacion(db, fila, 'OMITIDA', 'EXPORTACION_AUTOMATICA_OMITIDA', {
        motivo: 'exportacionAutomatica desactivada o PDF no habilitado'
      })
      continue
    }
    try {
      requirePermission(ctx, 'reportes.exportar')
    } catch {
      marcarExportacion(db, fila, 'DENEGADA', 'EXPORTACION_AUTOMATICA_DENEGADA', {
        motivo: 'sin permiso reportes.exportar', usuarioId: fila.usuario_id
      })
      continue
    }
    try {
      const datos = datosDocumentoExportado(db, fila.origen, fila.documento_id)
      if (!datos) throw errors.notFound('El documento exportable')
      const titulo = campo((datos.documento ?? {}) as Fila, ['tipo']) || fila.origen.toUpperCase()
      const buffer = await pdfMake.createPdf(definicionDocumento(datos, 'CARTA', preferencias)).getBuffer()
      const carpeta = resolverCarpetaExportacion(userDataPath, preferencias.carpetaExportacion)
      const nombre = nombreArchivo(titulo).replace(/\.pdf$/, `_${fila.id}.pdf`)
      writeFileSync(join(carpeta, nombre), buffer)
      marcarExportacion(db, fila, 'EXPORTADA', 'EXPORTACION_AUTOMATICA', {
        origen: fila.origen, documentoId: fila.documento_id, archivo: nombre, bytes: buffer.length
      })
      procesadas += 1
    } catch (error) {
      marcarExportacion(db, fila, 'ERROR', 'EXPORTACION_AUTOMATICA_ERROR', {
        motivo: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return procesadas
}

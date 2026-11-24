import * as pdfMakeModule from 'pdfmake/build/pdfmake.js'
import * as pdfFontsModule from 'pdfmake/build/vfs_fonts.js'
import type { SessionContext } from './context'
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

export interface FuentesPdf {
  ventas: { datosImpresion: Imprimir }
  compras: { datosImpresion: Imprimir }
  finanzas: {
    cxcImprimir: Imprimir
    cxpImprimir: Imprimir
    bancosImprimir: Imprimir
    cajasImprimir: Imprimir
  }
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

function definicionDocumento(datos: Fila, formato: string): Contenido {
  const documento = (datos.documento ?? {}) as Fila
  const empresa = (datos.empresa ?? {}) as Fila
  const lineas = Array.isArray(datos.lineas) ? datos.lineas as Fila[] : []
  const pagos = Array.isArray(datos.pagos) ? datos.pagos as Fila[] : []
  const ticket = formato.startsWith('TICKET')
  const contenido: Contenido[] = [
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
  contenido.push(pie())
  return {
    // pdfmake 0.3 espera puntos numéricos en pageSize; las cadenas "mm" se mutan
    // internamente y rompen el trazo de tablas en tickets.
    pageSize: ticket
      ? { width: formato === 'TICKET_58' ? 164.4 : 226.8, height: 841.9 }
      : formato === 'MEDIA' ? 'LETTER' : 'A4',
    pageMargins: ticket ? [6, 12, 6, 12] : [40, 45, 40, 45],
    content: contenido,
    styles: {
      titulo: { fontSize: ticket ? 12 : 16, bold: true },
      subtitulo: { fontSize: ticket ? 10 : 12, bold: true, alignment: 'center', margin: [0, 0, 0, 8] }
    },
    defaultStyle: { font: 'Roboto', fontSize: ticket ? 8 : 10 }
  }
}

function definicionReporte(datos: Fila): Contenido {
  const empresa = (datos.empresa ?? {}) as Fila
  const columnas = Array.isArray(datos.columnas) ? datos.columnas as Fila[] : []
  const filas = Array.isArray(datos.filas) ? datos.filas as Fila[] : []
  const totalesDatos = (datos.totales ?? {}) as Fila
  const contenido: Contenido[] = [
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
  contenido.push(pie())
  return {
    pageSize: 'A4',
    pageMargins: [30, 45, 30, 45],
    content: contenido,
    styles: { titulo: { fontSize: 14, bold: true } },
    defaultStyle: { font: 'Roboto', fontSize: 9 }
  }
}

export async function generarPdf(
  ctx: SessionContext,
  input: PdfGenerarInput,
  fuentes: FuentesPdf
): Promise<{ filename: string; base64: string; mime: string }> {
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
    else if (input.origen === 'cxp') datos = fuentes.finanzas.cxpImprimir(ctx, solicitud as never)
    else if (input.origen === 'banco') datos = fuentes.finanzas.bancosImprimir(ctx, solicitud as never)
    else datos = fuentes.finanzas.cajasImprimir(ctx, solicitud as never)
    titulo = campo((datos.documento ?? {}) as Fila, ['tipo']) || input.origen.toUpperCase()
  }
  const definicion = input.origen === 'reporte'
    ? definicionReporte(datos)
    : definicionDocumento(datos, input.formato)
  const buffer = await pdfMake.createPdf(definicion).getBuffer()
  return { filename: nombreArchivo(titulo), base64: buffer.toString('base64'), mime: 'application/pdf' }
}

import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'
import { formatosImpresion } from './ventas'

/** Esquemas compartidos de Fase 7. Todo importe se recibe en centavos enteros. */
const id = z.number().int().positive()
const texto = (max: number) => z.string().trim().max(max).default('')
const centavos = z.number().int().nonnegative()
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.')

export const tiposDocumentoCompra = [
  'SOLICITUD_COMPRA', 'ORDEN_COMPRA', 'RECEPCION', 'FACTURA_COMPRA', 'DEVOLUCION_COMPRA'
] as const

export const estadosDocumentoCompra = [
  'PENDIENTE', 'APROBADA', 'PARCIAL', 'COMPLETO', 'CONTABILIZADO', 'CONVERTIDA', 'ANULADO'
] as const

export const metodosPagoCompra = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'] as const

const lineaCompraSchema = z.object({
  productoId: id,
  /** Presente al devolver: identifica la línea de origen para no mezclar productos repetidos. */
  docLineaId: id.optional(),
  cantidad: z.number().finite().positive('La cantidad debe ser mayor que cero.'),
  /** Si se omite, el servicio usa el último costo o el promedio del producto. */
  precioCent: centavos.optional(),
  descripcion: z.string().trim().max(150).optional(),
  descuentoPctBp: z.number().int().min(0).max(10000).default(0),
  descuentoCent: centavos.optional(),
  /** Gastos asociados distribuidos en esta línea (flete, manipulación…). */
  gastoCent: centavos.optional(),
  impuestoId: id.optional(),
  exento: z.boolean().default(false),
  numeroSerie: texto(80),
  lote: texto(60)
})

const pagoCompraSchema = z.object({
  metodo: z.enum(metodosPagoCompra),
  montoCent: z.number().int().positive('El monto del pago debe ser mayor que cero.'),
  referencia: texto(60)
})

const cabeceraCompra = z.object({
  proveedorId: id,
  almacenId: id.optional(),
  fecha: fecha.optional(),
  vencimiento: fecha.optional(),
  /** NCF o número de factura recibido del proveedor: nunca se genera aquí. */
  numeroProveedor: texto(60),
  comentarios: texto(500),
  lineas: z.array(lineaCompraSchema).min(1, 'Agregue al menos una línea.').max(200)
})

export const documentoCompraSchema = cabeceraCompra.extend({
  tipo: z.enum(tiposDocumentoCompra),
  motivo: texto(300),
  docOrigenId: id.optional(),
  /** Las facturas a crédito generan CxP real; de lo contrario exigen pagos. */
  credito: z.boolean().default(false),
  pagos: z.array(pagoCompraSchema).min(1).max(10).optional()
})

export const recepcionSchema = z.object({
  ordenId: id,
  almacenId: id.optional(),
  lineas: z.array(z.object({
    docLineaId: id,
    cantidad: z.number().finite().positive('La cantidad recibida debe ser mayor que cero.')
  })).min(1, 'Agregue al menos una línea.').max(200),
  comentarios: texto(500)
})

export const convertirCompraSchema = z.object({
  id,
  tipoDestino: z.enum(['ORDEN_COMPRA', 'FACTURA_COMPRA']),
  almacenId: id.optional(),
  credito: z.boolean().default(false),
  pagos: z.array(pagoCompraSchema).min(1).max(10).optional(),
  comentarios: texto(500)
})

export const anularCompraSchema = z.object({
  id,
  motivo: z.string().trim().min(3, 'Indique el motivo de la anulación.').max(300).default('Anulación solicitada')
})

export const documentosFiltroCompraSchema = conDefaultsDeObjetoVacio(z.object({
  tipo: z.enum(tiposDocumentoCompra).optional(),
  estado: z.enum(estadosDocumentoCompra).optional(),
  proveedorId: id.optional(),
  fechaDesde: fecha.optional(),
  fechaHasta: fecha.optional(),
  limite: z.number().int().min(1).max(1000).default(300)
}))

export const exportarComprasSchema = z.object({
  filtro: documentosFiltroCompraSchema.optional()
})

export const imprimirCompraSchema = z.object({
  id,
  formato: z.enum(formatosImpresion).default('CARTA')
})

/**
 * Los servicios reciben `z.input`: el router aplica los defaults, pero las llamadas
 * internas (conversiones, recepciones y pruebas) pueden omitirlos.
 */
export type LineaCompraInput = z.input<typeof lineaCompraSchema>
export type PagoCompraInput = z.input<typeof pagoCompraSchema>
export type DocumentoCompraInput = z.input<typeof documentoCompraSchema>
export type RecepcionInput = z.input<typeof recepcionSchema>
export type ConvertirCompraInput = z.input<typeof convertirCompraSchema>
export type AnularCompraInput = z.input<typeof anularCompraSchema>
export type DocumentosFiltroCompra = z.infer<typeof documentosFiltroCompraSchema>
export type DocumentosFiltroCompraInput = Omit<DocumentosFiltroCompra, 'limite'> & { limite?: number }
export type ImprimirCompraInput = z.input<typeof imprimirCompraSchema>

import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'

/** Esquemas compartidos de Fase 6. Todo importe se recibe en centavos enteros. */
const id = z.number().int().positive()
const texto = (max: number) => z.string().trim().max(max).default('')
const centavos = z.number().int().nonnegative()
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.')

export const tiposDocumentoVenta = [
  'FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS', 'COTIZACION', 'PEDIDO',
  'NOTA_CREDITO', 'NOTA_DEBITO', 'DEVOLUCION_VENTA'
] as const

export const estadosDocumentoVenta = [
  'ACTIVO', 'PENDIENTE', 'APROBADA', 'CONTABILIZADO', 'CONVERTIDA', 'ANULADO', 'VENCIDA'
] as const

export const metodosPago = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'] as const
export const formatosImpresion = ['CARTA', 'MEDIA', 'TICKET_80', 'TICKET_58'] as const

const lineaVentaSchema = z.object({
  productoId: id,
  cantidad: z.number().finite().positive('La cantidad debe ser mayor que cero.'),
  /** Si se omite, el servicio usa precio1_cent del producto. */
  precioCent: centavos.optional(),
  descripcion: z.string().trim().max(150).optional(),
  descuentoPctBp: z.number().int().min(0).max(10000).default(0),
  descuentoCent: centavos.optional(),
  impuestoId: id.optional(),
  exento: z.boolean().default(false),
  numeroSerie: texto(80),
  lote: texto(60)
})

const pagoSchema = z.object({
  metodo: z.enum(metodosPago),
  montoCent: z.number().int().positive('El monto del pago debe ser mayor que cero.'),
  referencia: texto(60)
})

const cabeceraVenta = z.object({
  clienteId: id,
  almacenId: id.optional(),
  vendedorId: id.optional(),
  fecha: fecha.optional(),
  vencimiento: fecha.optional(),
  comentarios: texto(500),
  lineas: z.array(lineaVentaSchema).min(1, 'Agregue al menos una línea.').max(200)
})

export const documentoVentaSchema = cabeceraVenta.extend({
  tipo: z.enum(tiposDocumentoVenta),
  motivo: texto(300),
  docOrigenId: id.optional(),
  pagos: z.array(pagoSchema).min(1).max(10).optional()
})

export const posCarritoSchema = cabeceraVenta
/** Cotizaciones y pedidos no requieren tipo en el payload: el servicio lo fija. */
export const cotizacionCarritoSchema = cabeceraVenta

export const posVentaSchema = posCarritoSchema.extend({
  /** Si se omite, se usa la sesión abierta del usuario. */
  cajaSesionId: id.optional(),
  suspensionId: id.optional(),
  pagos: z.array(pagoSchema).min(1, 'Registre al menos un pago.').max(10)
})

export const suspenderVentaSchema = z.object({
  nombre: z.string().trim().min(1, 'Indique un nombre para la venta suspendida.').max(60),
  carrito: posCarritoSchema
})

export const anularDocumentoSchema = z.object({
  id,
  motivo: z.string().trim().min(3, 'Indique el motivo de la anulación.').max(300).default('Anulación solicitada')
})

export const convertirDocumentoSchema = z.object({
  id,
  tipoDestino: z.enum(['PEDIDO', 'FACTURA_CONTADO', 'FACTURA_CREDITO']),
  almacenId: id.optional(),
  vendedorId: id.optional(),
  comentarios: texto(500)
})

export const conduceSchema = z.object({
  docVentaId: id,
  lineas: z.array(z.object({
    docLineaId: id,
    cantidad: z.number().finite().positive('La cantidad entregada debe ser mayor que cero.')
  })).min(1, 'Agregue al menos una línea.').max(200)
})

export const entregaSchema = z.object({
  conduceId: id,
  lineas: z.array(z.object({
    conduceLineaId: id,
    cantidad: z.number().finite().positive('La cantidad debe ser mayor que cero.')
  })).min(1, 'Agregue al menos una línea.').max(200)
})

export const documentosFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  tipo: z.enum(tiposDocumentoVenta).optional(),
  estado: z.enum(estadosDocumentoVenta).optional(),
  clienteId: id.optional(),
  fechaDesde: fecha.optional(),
  fechaHasta: fecha.optional(),
  limite: z.number().int().min(1).max(1000).default(300)
}))

export const exportarVentasSchema = z.object({
  filtro: documentosFiltroSchema.optional()
})

export const imprimirDocumentoSchema = z.object({
  id,
  formato: z.enum(formatosImpresion).default('CARTA')
})

export const abrirCajaSchema = z.object({
  cajaId: id.optional(),
  montoCent: centavos.default(0),
  observaciones: texto(300)
})

export const cerrarCajaSchema = z.object({
  sesionId: id,
  montoCent: centavos,
  observaciones: texto(300)
})

/**
 * Los servicios reciben `z.input`: el router ya aplicó los defaults, pero las
 * llamadas internas (POS, conversiones, pruebas) pueden omitirlos.
 */
export type LineaVentaInput = z.input<typeof lineaVentaSchema>
export type PagoInput = z.input<typeof pagoSchema>
export type DocumentoVentaInput = z.input<typeof documentoVentaSchema>
export type PosCarritoInput = z.input<typeof posCarritoSchema>
export type CotizacionCarritoInput = z.input<typeof cotizacionCarritoSchema>
export type PosVentaInput = z.input<typeof posVentaSchema>
export type SuspenderVentaInput = z.input<typeof suspenderVentaSchema>
export type AnularDocumentoInput = z.input<typeof anularDocumentoSchema>
export type ConvertirDocumentoInput = z.input<typeof convertirDocumentoSchema>
export type ConduceInput = z.input<typeof conduceSchema>
export type EntregaInput = z.input<typeof entregaSchema>
export type DocumentosFiltro = z.infer<typeof documentosFiltroSchema>
/** El router aplica el default; los servicios lo aceptan opcional para llamadas internas. */
export type DocumentosFiltroInput = Omit<DocumentosFiltro, 'limite'> & { limite?: number }
export type ImprimirDocumentoInput = z.input<typeof imprimirDocumentoSchema>
export type AbrirCajaInput = z.input<typeof abrirCajaSchema>
export type CerrarCajaInput = z.input<typeof cerrarCajaSchema>

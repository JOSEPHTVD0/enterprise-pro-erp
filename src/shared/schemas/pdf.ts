import { z } from 'zod'
import { formatosImpresion } from './ventas'
import { reportesImprimirSchema } from './reportes'

/** Entrada para generar un PDF real con pdfmake a partir de datos ya autorizados. */
export const pdfGenerarSchema = z.object({
  origen: z.enum(['venta', 'compra', 'cxc', 'cxp', 'banco', 'caja', 'reporte']),
  id: z.number().int().positive().optional(),
  formato: z.enum(formatosImpresion).default('CARTA'),
  tipo: z.enum(['DOCUMENTO', 'RECIBO', 'PAGO']).optional(),
  reporte: reportesImprimirSchema.shape.reporte.optional(),
  /** Se valida de nuevo contra `reportesImprimirSchema` dentro del servicio. */
  filtro: z.record(z.string(), z.unknown()).optional()
}).refine((value) => value.origen === 'reporte' ? !!value.reporte : !!value.id, {
  message: 'Indique el documento o el reporte que desea exportar a PDF.'
})

export type PdfGenerarInput = z.infer<typeof pdfGenerarSchema>

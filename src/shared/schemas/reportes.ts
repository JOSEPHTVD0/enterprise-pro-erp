import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'

/** Esquemas compartidos de Fase 9. Los importes viajan siempre en centavos enteros. */

const id = z.number().int().positive()
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.')
const textoOpcional = (max: number) => z.string().trim().max(max).optional()

export const tiposReporte = [
  'RESUMEN', 'VENTAS', 'COMPRAS', 'INVENTARIO', 'CXC', 'CXP', 'LIBRO606', 'LIBRO607'
] as const
export const tipoReporte = z.enum(tiposReporte)

export const reportesFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  fechaDesde: fecha.optional(),
  fechaHasta: fecha.optional(),
  tipo: textoOpcional(40),
  estado: textoOpcional(20),
  entidadId: id.optional(),
  limite: z.number().int().min(1).max(1000).default(300)
}))

export const reportesSerieSchema = conDefaultsDeObjetoVacio(z.object({
  fechaDesde: fecha.optional(),
  fechaHasta: fecha.optional(),
  granularidad: z.enum(['DIA', 'MES']).default('DIA')
}))

export const reportesConsultaSchema = z.object({
  reporte: tipoReporte,
  filtro: reportesFiltroSchema.optional()
})

export const reportesExportarSchema = z.object({
  reporte: tipoReporte.exclude(['RESUMEN']),
  formato: z.enum(['XLSX', 'CSV']).default('XLSX'),
  filtro: reportesFiltroSchema.optional()
})

export const reportesImprimirSchema = z.object({
  reporte: tipoReporte.exclude(['RESUMEN']),
  filtro: reportesFiltroSchema.optional()
})

export type TipoReporte = z.infer<typeof tipoReporte>
export type ReportesFiltro = z.infer<typeof reportesFiltroSchema>
export type ReportesFiltroInput = z.input<typeof reportesFiltroSchema>
export type ReportesSerie = z.infer<typeof reportesSerieSchema>
export type ReportesSerieInput = z.input<typeof reportesSerieSchema>
export type ReportesConsultaInput = z.infer<typeof reportesConsultaSchema>
export type ReportesExportarInput = z.infer<typeof reportesExportarSchema>
export type ReportesImprimirInput = z.infer<typeof reportesImprimirSchema>

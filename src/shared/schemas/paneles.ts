import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'

export const dashboardEjecutivoSchema = conDefaultsDeObjetoVacio(z.object({
  periodo: z.enum(['MES', 'TRIMESTRE', 'ANIO', 'PERSONALIZADO']).default('ANIO'),
  fechaDesde: z.string().max(10).optional(),
  fechaHasta: z.string().max(10).optional(),
  almacenId: z.number().int().positive().optional()
}))

export type DashboardEjecutivoFiltro = z.infer<typeof dashboardEjecutivoSchema>

export const inteligenciaFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  periodo: z.enum(['MES', 'TRIMESTRE', 'ANIO']).default('ANIO')
}))

export type InteligenciaFiltro = z.infer<typeof inteligenciaFiltroSchema>

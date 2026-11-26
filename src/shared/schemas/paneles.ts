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

export const panel2026FiltroSchema = conDefaultsDeObjetoVacio(z.object({
  vista: z.enum(['OPERATIVA', 'FINANCIERA', 'RIESGO']).default('OPERATIVA'),
  periodo: z.enum(['MES', 'TRIMESTRE', 'ANIO']).default('ANIO'),
  metricaPrincipal: z.enum(['VENTAS', 'COBROS', 'CXC', 'STOCK']).default('VENTAS')
}))
export type Panel2026Filtro = z.infer<typeof panel2026FiltroSchema>

export const preferenciasPanelSchema = z.object({
  verUtilidad: z.boolean(),
  verCostos: z.boolean(),
  verSalud: z.boolean(),
  seriesPorDefecto: z.enum(['DIA', 'MES']),
  filasDashboard: z.number().int().min(3).max(20),
  filasPanel: z.number().int().min(3).max(50),
  intervaloActualizacionSeg: z.number().int().min(30).max(3600)
})
export type PreferenciasPanel = z.infer<typeof preferenciasPanelSchema>

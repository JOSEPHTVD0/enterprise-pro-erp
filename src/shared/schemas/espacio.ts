import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'
import { formatosImpresion } from './ventas'

/** Esquemas del Espacio de trabajo. Todo importe viaja en centavos enteros. */
const id = z.number().int().positive()
const texto = (max: number) => z.string().trim().max(max).default('')
const fechaOpcional = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.'), z.literal('')]).default('')

export const espacioVistas = ['GENERAL', 'VENTAS', 'COMPRAS', 'INVENTARIO', 'FINANZAS'] as const
export const espacioPeriodos = ['MES', 'TRIMESTRE', 'ANIO', 'PERSONALIZADO'] as const
export const espacioOrigenes = ['venta', 'compra'] as const

export const espacioFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  vista: z.enum(espacioVistas).default('GENERAL'),
  periodo: z.enum(espacioPeriodos).default('ANIO'),
  fechaDesde: fechaOpcional,
  fechaHasta: fechaOpcional,
  almacenId: id.optional()
}))
export type EspacioFiltro = z.infer<typeof espacioFiltroSchema>

export const espacioComprobantesFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  origen: z.enum(espacioOrigenes).default('venta'),
  tipo: texto(40),
  estado: texto(40),
  texto: texto(80),
  fechaDesde: fechaOpcional,
  fechaHasta: fechaOpcional,
  limite: z.number().int().min(1).max(100).default(30)
}))
export type EspacioComprobantesFiltro = z.infer<typeof espacioComprobantesFiltroSchema>

export const espacioComprobanteEmitirSchema = z.object({
  origen: z.enum(espacioOrigenes),
  id,
  formato: z.enum(formatosImpresion).default('CARTA'),
  motivo: texto(120)
})
export type EspacioComprobanteEmitir = z.infer<typeof espacioComprobanteEmitirSchema>

export const espacioPresetSchema = z.object({
  id: id.optional(),
  nombre: z.string().trim().min(2).max(50),
  descripcion: texto(160),
  settings: z.record(z.string(), z.unknown()),
  ajustes: z.record(z.string(), z.unknown())
}).superRefine((valor, ctx) => {
  const bytes = JSON.stringify({ settings: valor.settings, ajustes: valor.ajustes }).length
  if (bytes > 40_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ajustes'], message: 'La plantilla es demasiado grande.' })
  }
})
export type EspacioPreset = z.infer<typeof espacioPresetSchema>

export const espacioPresetIdSchema = z.object({ id })
export const espacioReindexSchema = z.object({ confirmacion: z.literal('REINDEX') })
export const espacioExportarSchema = espacioComprobantesFiltroSchema

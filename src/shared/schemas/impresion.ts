import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'
import { formatosImpresion } from './ventas'

/** Modos de impresión soportados por `webContents.print` de Electron. */
export const modosImpresion = ['SILENCIOSA', 'DIALOGO'] as const
export const orientacionesImpresion = ['VERTICAL', 'HORIZONTAL'] as const

/** Datos que Electron informa para cada impresora instalada en Windows. */
export const impresoraInfoSchema = z.object({
  name: z.string().min(1),
  displayName: z.string(),
  description: z.string(),
  isDefault: z.boolean().default(false),
  status: z.number().int().default(0)
})

/** Opciones que el renderer puede pedir sin exponer SQL, rutas ni lógica de negocio. */
export const opcionesImpresionSchema = conDefaultsDeObjetoVacio(z.object({
  /** Nombre definido por el sistema (no el nombre amigable), requerido por Electron. */
  impresora: z.string().max(200).default(''),
  modo: z.enum(modosImpresion).default('DIALOGO'),
  copias: z.number().int().min(1).max(20).default(1),
  formato: z.enum(formatosImpresion).default('CARTA'),
  color: z.boolean().default(true),
  fondo: z.boolean().default(true),
  orientacion: z.enum(orientacionesImpresion).default('VERTICAL')
}))

export const impresionEjecutarSchema = z.object({
  opciones: opcionesImpresionSchema,
  etiqueta: z.string().trim().max(200).default('')
})

export const impresionPruebaSchema = z.object({
  impresora: z.string().max(200).default(''),
  modo: z.enum(modosImpresion).default('DIALOGO')
})

export type ImpresoraInfo = z.infer<typeof impresoraInfoSchema>
export type OpcionesImpresion = z.infer<typeof opcionesImpresionSchema>
export type ImpresionEjecutar = z.infer<typeof impresionEjecutarSchema>

import { z } from 'zod'
import { documentTypes } from '../document-types'
import { formatosImpresion } from './ventas'

const id = z.number().int().positive()

export const empresaSchema = z.object({
  id: id.optional(),
  nombreComercial: z.string().trim().min(2).max(100),
  razonSocial: z.string().trim().min(2).max(150),
  rnc: z.union([z.string().regex(/^\d{9}$|^\d{11}$/, 'RNC debe tener 9 u 11 dígitos'), z.literal('')]).default(''),
  cedula: z.string().trim().max(20).default(''),
  direccion: z.string().trim().max(250).default(''),
  telefonos: z.string().trim().max(100).default(''),
  email: z.union([z.string().email(), z.literal('')]).default(''),
  logoPath: z.string().trim().max(300).nullable().optional(),
  monedaBase: z.string().length(3).default('DOP'),
  activa: z.boolean().default(true)
})

export const parametroSchema = z.object({
  clave: z.string().min(2).max(60),
  valor: z.union([z.string(), z.number(), z.boolean(), z.null()])
})

export const impuestoSchema = z.object({
  id: id.optional(),
  codigo: z.string().trim().min(2).max(20),
  descripcion: z.string().trim().min(2).max(80),
  tasaBp: z.number().int().min(0).max(10000),
  exento: z.boolean().default(false),
  activo: z.boolean().default(true)
})

export const monedaSchema = z.object({
  codigo: z.string().trim().length(3).regex(/^[A-Z]{3}$/),
  nombre: z.string().trim().min(2).max(50),
  simbolo: z.string().trim().min(1).max(5),
  decimales: z.number().int().min(0).max(4).default(2),
  activa: z.boolean().default(true)
})

export const tasaCambioSchema = z.object({
  monedaCodigo: z.string().length(3),
  tasa: z.number().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export const serieSchema = z.object({
  id: id.optional(),
  tipoDoc: z.enum(documentTypes),
  serie: z.string().trim().max(10).default(''),
  prefijo: z.string().trim().max(20).default(''),
  siguiente: z.number().int().positive().default(1),
  longitud: z.number().int().min(4).max(20).default(8),
  esNcf: z.boolean().default(false),
  rangoDesde: z.string().max(20).default(''),
  rangoHasta: z.string().max(20).default(''),
  venceEn: z.string().max(10).default(''),
  alertaMin: z.number().int().min(0).default(10),
  activa: z.boolean().default(true)
})

export const almacenSchema = z.object({
  id: id.optional(),
  codigo: z.string().trim().min(1).max(20),
  nombre: z.string().trim().min(2).max(60),
  direccion: z.string().trim().max(200).default(''),
  principal: z.boolean().default(false),
  activo: z.boolean().default(true)
})

export const cajaSchema = z.object({
  id: id.optional(),
  codigo: z.string().trim().min(1).max(20),
  nombre: z.string().trim().min(2).max(60),
  impresoraTicket: z.string().trim().max(100).default(''),
  activa: z.boolean().default(true)
})

export const impresoraSchema = z.object({
  id: id.optional(),
  nombre: z.string().trim().min(2).max(100),
  puerto: z.string().trim().max(150).default(''),
  tipo: z.enum(['CARTA', 'TICKET_80', 'TICKET_58']).default('CARTA'),
  predeterminada: z.boolean().default(false)
})

/** Acepta los valores históricos guardados por versiones anteriores. */
const formatoImpresionSchema = z.preprocess(
  (valor) => valor === 'MEDIA_PAGINA' ? 'MEDIA'
    : valor === 'TICKET80' ? 'TICKET_80'
      : valor === 'TICKET58' ? 'TICKET_58' : valor,
  z.enum(formatosImpresion)
)

export const formatoSchema = z.object({
  tipoDoc: z.enum(documentTypes),
  formato: formatoImpresionSchema,
  copias: z.number().int().min(1).max(5).default(1)
})

export const backupConfigSchema = z.object({
  /** Ruta relativa dentro de userData/backups; nunca absoluta ni con `..`. */
  carpeta: z.string().trim().max(300).refine(
    (valor) => !/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(valor) &&
      !valor.split(/[\\/]/).includes('..'),
    'Use una ruta relativa dentro de la carpeta de respaldos.'
  ).default(''),
  frecuencia: z.enum(['DESACTIVADO', 'DIARIO', 'SEMANAL', 'MENSUAL']).default('DIARIO'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('02:00'),
  retencionDias: z.number().int().min(1).max(365).default(30)
})

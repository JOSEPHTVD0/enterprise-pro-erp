import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'

export const idModuloSchema = z.number().int().positive()

const texto = (max: number): z.ZodString => z.string().trim().min(1).max(max)
const opcional = (max: number): z.ZodDefault<z.ZodString> => z.string().trim().max(max).default('')
const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use el formato AAAA-MM.')
const centavos = z.number().int().nonnegative()
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.')

export const filtroModulosSchema = conDefaultsDeObjetoVacio(z.object({
  estado: z.string().max(30).optional(),
  fechaDesde: z.string().max(10).optional(),
  fechaHasta: z.string().max(10).optional(),
  limite: z.number().int().min(1).max(500).default(100)
}))

export const cambiarEstadoSchema = z.object({
  id: idModuloSchema,
  estado: texto(30),
  motivo: opcional(500)
})

export const presupuestoCrearSchema = z.object({
  nombre: texto(120),
  periodo: periodo.default(() => new Date().toISOString().slice(0, 7)),
  centroCosto: z.string().trim().max(60).default('GENERAL'),
  observaciones: opcional(500),
  lineas: z.array(z.object({
    categoria: texto(60),
    descripcion: texto(160),
    montoCent: centavos.refine((v) => v > 0, 'El monto debe ser mayor que cero.')
  })).min(1).max(200)
})

export const presupuestoEjecutarSchema = z.object({
  id: idModuloSchema,
  montoCent: centavos.refine((v) => v > 0, 'El monto debe ser mayor que cero.'),
  descripcion: opcional(300)
})

export const servicioCatalogoSchema = z.object({
  codigo: texto(30),
  nombre: texto(120),
  descripcion: opcional(300),
  precioCent: centavos,
  duracionMin: z.number().int().min(0).max(10080).default(60),
  activo: z.boolean().default(true)
})

export const ordenServicioCrearSchema = z.object({
  clienteId: idModuloSchema,
  tecnicoId: idModuloSchema.optional(),
  fechaCompromiso: z.union([fecha, z.literal('')]).default(''),
  prioridad: z.enum(['BAJA', 'NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'),
  tasaBp: z.number().int().min(0).max(18000).default(1800),
  diagnostico: opcional(1000),
  observaciones: opcional(500),
  lineas: z.array(z.object({
    servicioId: idModuloSchema,
    cantidad: z.number().positive().max(10000),
    descripcion: z.string().trim().max(200).optional(),
    precioCent: centavos.optional()
  })).min(1).max(100)
})

export const activoCrearSchema = z.object({
  nombre: texto(120),
  categoria: z.enum(['EQUIPO', 'MOBILIARIO', 'VEHICULO', 'INMUEBLE', 'SOFTWARE', 'OTRO']),
  codigoInterno: opcional(40),
  ubicacion: opcional(120),
  responsableId: idModuloSchema.optional(),
  fechaCompra: fecha.default(() => new Date().toISOString().slice(0, 10)),
  valorAdquisicionCent: centavos.refine((v) => v > 0, 'El valor debe ser mayor que cero.'),
  valorResidualCent: centavos.default(0),
  vidaUtilMeses: z.number().int().min(1).max(600).default(60),
  observaciones: opcional(500)
})

export const activoDepreciarSchema = z.object({
  id: idModuloSchema,
  periodo,
  montoCent: centavos.optional()
})

export const leadCrearSchema = z.object({
  nombre: texto(120),
  empresa: opcional(120),
  rncCedula: opcional(30),
  telefono: opcional(40),
  email: z.string().trim().max(120).default(''),
  origen: z.enum(['WEB', 'REFERIDO', 'LLAMADA', 'REDES', 'EVENTO', 'OTRO']).default('OTRO'),
  probabilidad: z.number().int().min(0).max(100).default(10),
  valorEstimadoCent: centavos.default(0),
  responsableId: idModuloSchema.optional(),
  proximoSeguimiento: z.union([fecha, z.literal('')]).default(''),
  observaciones: opcional(600)
})

export const leadEstadoSchema = z.object({
  id: idModuloSchema,
  estado: z.enum(['NUEVO', 'CONTACTADO', 'CALIFICADO', 'PROPUESTA', 'NEGOCIACION', 'GANADO', 'PERDIDO']),
  probabilidad: z.number().int().min(0).max(100).optional(),
  motivo: opcional(300)
})

export const seguimientoCrearSchema = z.object({
  leadId: idModuloSchema,
  tipo: z.enum(['LLAMADA', 'EMAIL', 'VISITA', 'MENSAJE', 'OTRO']).default('LLAMADA'),
  descripcion: texto(800),
  proximoSeguimiento: z.union([fecha, z.literal('')]).default('')
})

export const leadConvertirSchema = z.object({
  leadId: idModuloSchema,
  codigoCliente: z.string().trim().max(30).optional()
})

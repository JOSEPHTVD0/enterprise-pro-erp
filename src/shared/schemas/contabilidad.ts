import { z } from 'zod'
import { naturalezas, tiposCuenta } from '../contabilidad'
import { conDefaultsDeObjetoVacio } from './defaults'

/** Esquemas IPC de contabilidad. Todo dinero es un entero en centavos. */

export const idContSchema = z.number().int().positive()
export const fechaContSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.')

const texto = (min: number, max: number): z.ZodString => z.string().trim().min(min).max(max)
const opcional = (max: number): z.ZodDefault<z.ZodString> => z.string().trim().max(max).default('')
const centavos = z.number().int().nonnegative()
const fechaOpcional = z.union([fechaContSchema, z.literal('')]).optional()

export const filtroContabilidadSchema = conDefaultsDeObjetoVacio(z.object({
  fechaDesde: fechaOpcional,
  fechaHasta: fechaOpcional,
  estado: z.string().trim().max(30).optional(),
  limite: z.number().int().min(1).max(1000).default(300)
}))

export const cuentaCrearSchema = z.object({
  codigo: texto(1, 20),
  nombre: texto(2, 100),
  tipo: z.enum(tiposCuenta),
  naturaleza: z.enum(naturalezas),
  padreId: idContSchema.optional(),
  aceptaMovimiento: z.boolean().default(true)
})

export const cuentaModificarSchema = z.object({
  id: idContSchema,
  nombre: texto(2, 100),
  tipo: z.enum(tiposCuenta),
  naturaleza: z.enum(naturalezas),
  aceptaMovimiento: z.boolean(),
  activa: z.boolean()
})

export const cuentaEstadoSchema = z.object({
  id: idContSchema,
  activa: z.boolean()
})

export const periodoAbrirSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12)
})

export const periodoCerrarSchema = z.object({
  id: idContSchema
})

export const asientoCrearSchema = z.object({
  fecha: fechaContSchema,
  descripcion: texto(2, 200),
  tipo: z.enum(['MANUAL', 'VENTA', 'COMPRA', 'PAGO', 'COBRO', 'AJUSTE']).default('MANUAL'),
  lineas: z.array(z.object({
    cuentaId: idContSchema,
    debeCent: centavos,
    haberCent: centavos,
    descripcion: opcional(120)
  })).min(2).max(50)
})

export const asientoEstadoSchema = z.object({
  id: idContSchema,
  estado: z.enum(['CONFIRMAR', 'ANULAR'])
})

export const mayorSchema = z.object({
  cuentaId: idContSchema,
  fechaDesde: fechaOpcional,
  fechaHasta: fechaOpcional
})

export const integrarSchema = conDefaultsDeObjetoVacio(z.object({
  fechaDesde: fechaOpcional,
  fechaHasta: fechaOpcional,
  limite: z.number().int().min(1).max(1000).default(200)
}))

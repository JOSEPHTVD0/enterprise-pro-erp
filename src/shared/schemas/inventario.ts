import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './defaults'

/** Tipos de movimiento del kardex. La dirección (entrada/salida) es inherente al tipo. */
export const tiposMovimiento = [
  'COMPRA', 'VENTA', 'DEV_VENTA', 'DEV_COMPRA',
  'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA',
  'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'PERDIDA', 'DANIO', 'CONTEO', 'PRODUCCION'
] as const

/** Tipos que puede originar directamente el usuario en la Fase 5. */
export const tiposMovimientoManual = [
  'COMPRA', 'DEV_VENTA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'PERDIDA', 'DANIO', 'PRODUCCION'
] as const

export const entradasInventario = new Set<string>([
  'COMPRA', 'DEV_VENTA', 'TRANSFERENCIA_ENTRADA', 'AJUSTE_ENTRADA', 'CONTEO', 'PRODUCCION'
])

const id = z.number().int().positive()
const texto = (max: number) => z.string().trim().max(max).default('')
const centavos = z.number().int().nonnegative()
const cantidadNoNula = (mensaje: string) =>
  z.number().finite().refine((v) => v !== 0, mensaje)

export const movimientoSchema = z.object({
  productoId: id,
  almacenId: id,
  tipo: z.enum(tiposMovimientoManual),
  /** Firmada: > 0 entrada, < 0 salida. */
  cantidad: cantidadNoNula('La cantidad no puede ser cero.'),
  costoUnitCent: centavos.default(0),
  motivo: texto(300),
  referencia: texto(60)
}).superRefine((value, ctx) => {
  const esEntrada = entradasInventario.has(value.tipo)
  if (esEntrada && value.cantidad <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cantidad'], message: 'Este tipo de movimiento requiere cantidad positiva.' })
  }
  if (!esEntrada && value.cantidad >= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cantidad'], message: 'Este tipo de movimiento requiere cantidad negativa.' })
  }
})

const lineaAjuste = z.object({
  productoId: id,
  /** Delta firmado. Obligatorio salvo en conteos. */
  cantidad: z.number().finite().optional(),
  /** Saldo físico contado. Solo para ajustes de tipo CONTEO. */
  cantidadNueva: z.number().finite().nonnegative().optional(),
  costoUnitCent: centavos.optional()
})

export const ajusteSchema = z.object({
  tipo: z.enum(['AJUSTE', 'CONTEO', 'PERDIDA', 'DANIO']),
  almacenId: id,
  motivo: z.string().trim().min(3, 'Indique el motivo del ajuste.').max(300),
  lineas: z.array(lineaAjuste).min(1, 'Agregue al menos una línea.').max(200)
}).superRefine((value, ctx) => {
  value.lineas.forEach((linea, i) => {
    if (value.tipo === 'CONTEO') {
      if (linea.cantidadNueva === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineas', i, 'cantidadNueva'], message: 'En un conteo indique la cantidad física contada.' })
      }
      return
    }
    if (!linea.cantidad) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineas', i, 'cantidad'], message: 'Indique la cantidad del ajuste.' })
      return
    }
    if ((value.tipo === 'PERDIDA' || value.tipo === 'DANIO') && linea.cantidad > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineas', i, 'cantidad'], message: 'Pérdidas y daños deben ser cantidades negativas.' })
    }
  })
})

export const transferenciaSchema = z.object({
  almacenOrigenId: id,
  almacenDestinoId: id,
  motivo: texto(300),
  lineas: z.array(z.object({
    productoId: id,
    cantidad: z.number().finite().positive('La cantidad debe ser mayor que cero.')
  })).min(1, 'Agregue al menos una línea.').max(200)
}).refine((value) => value.almacenOrigenId !== value.almacenDestinoId, {
  path: ['almacenDestinoId'], message: 'El almacén de destino debe ser distinto del origen.'
})

export const existenciasFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  almacenId: id.optional(),
  productoId: id.optional(),
  soloMinimos: z.boolean().optional()
}))

export const kardexFiltroSchema = conDefaultsDeObjetoVacio(z.object({
  productoId: id.optional(),
  almacenId: id.optional(),
  tipo: z.enum(tiposMovimiento).optional(),
  fechaDesde: z.string().max(20).optional(),
  fechaHasta: z.string().max(20).optional(),
  limite: z.number().int().min(1).max(1000).default(300)
}))

export const serieProductoSchema = z.object({
  productoId: id,
  almacenId: id.optional(),
  serie: z.string().trim().min(1, 'Indique el número de serie.').max(80)
})

export const loteProductoSchema = z.object({
  productoId: id,
  almacenId: id.optional(),
  lote: z.string().trim().min(1, 'Indique el lote.').max(60),
  vencimiento: texto(10),
  cantidad: z.number().finite().nonnegative().default(0)
})

export const anularSchema = z.object({ id })

export const exportarInventarioSchema = z.object({
  vista: z.enum(['existencias', 'kardex']),
  filtro: z.union([existenciasFiltroSchema, kardexFiltroSchema]).optional()
})

export type MovimientoInput = z.infer<typeof movimientoSchema>
export type AjusteInput = z.infer<typeof ajusteSchema>
export type TransferenciaInput = z.infer<typeof transferenciaSchema>
export type KardexFiltro = z.infer<typeof kardexFiltroSchema>
/** El router aplica el default; los servicios lo aceptan opcional para llamadas internas. */
export type KardexFiltroInput = Omit<KardexFiltro, 'limite'> & { limite?: number }
export type ExistenciasFiltro = z.infer<typeof existenciasFiltroSchema>

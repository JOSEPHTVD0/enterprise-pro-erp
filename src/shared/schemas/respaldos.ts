import { z } from 'zod'

export const respaldosCrearSchema = z.object({
  tipo: z.enum(['MANUAL', 'AUTO']).default('MANUAL')
})

export const respaldosHistorialSchema = z.object({}).default({})

export const respaldosIntegridadSchema = z.object({
  id: z.number().int().positive().optional()
}).default({})

/** La confirmación se exige también en backend: la UI nunca puede restaurar por accidente. */
export const CONFIRMACION_RESTAURACION = 'RESTAURAR'

export const respaldosRestaurarSchema = z.object({
  id: z.number().int().positive(),
  confirmacion: z.literal(CONFIRMACION_RESTAURACION)
})

export type RespaldosCrearInput = z.infer<typeof respaldosCrearSchema>
export type RespaldosIntegridadInput = z.infer<typeof respaldosIntegridadSchema>
export type RespaldosRestaurarInput = z.infer<typeof respaldosRestaurarSchema>

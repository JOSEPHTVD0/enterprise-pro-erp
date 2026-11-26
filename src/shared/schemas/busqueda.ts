import { z } from 'zod'
import { maestroEntidadSchema } from '../maestros'

/**
 * Búsqueda global de solo lectura. El renderer nunca envía SQL ni nombres de tabla:
 * el servicio filtra entidades por los permisos del contexto y por empresa_id.
 */
export const busquedaGlobalSchema = z.object({
  texto: z.string().trim().min(2).max(80),
  entidades: z.array(maestroEntidadSchema).max(8).optional(),
  incluirInactivos: z.boolean().optional(),
  limite: z.number().int().min(1).max(50).default(12)
})

export type BusquedaGlobalInput = z.infer<typeof busquedaGlobalSchema>

export interface BusquedaGlobalResultado {
  id: string
  entidad: string
  titulo: string
  subtitulo: string
  vista: string
  score: number
}

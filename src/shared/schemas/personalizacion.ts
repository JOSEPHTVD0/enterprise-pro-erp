import { z } from 'zod'
import { ajustesGrupoEnum } from './ajustes'
import { permissionKeySchema } from './auth'

/**
 * Capas de personalización. Una capa se aplica cuando el usuario tiene el rol
 * indicado o el permiso indicado. Nunca sustituye a la validación de ajustes ni
 * a las políticas duras del backend.
 */
export const ajustesAmbitos = ['ROL', 'PERMISO'] as const
export type AjustesAmbito = (typeof ajustesAmbitos)[number]

/**
 * Para ROL es el id numérico como texto; para PERMISO, una clave del catálogo
 * o del espacio `custom.*`. La existencia real se comprueba en el servicio.
 */
const objetivoSchema = z.union([z.string().trim().regex(/^\d{1,10}$/), permissionKeySchema])

export const ajustesPersonalizadosGetSchema = z.object({
  grupo: ajustesGrupoEnum.optional()
}).default({})

export const ajustesPersonalizadoSaveSchema = z.object({
  ambito: z.enum(ajustesAmbitos),
  objetivo: objetivoSchema,
  grupo: ajustesGrupoEnum,
  /** Se valida otra vez contra ajustesPorGrupo[grupo] dentro del servicio. */
  datos: z.record(z.string(), z.unknown())
})

export const ajustesPersonalizadoDeleteSchema = z.object({
  ambito: z.enum(ajustesAmbitos),
  objetivo: objetivoSchema,
  grupo: ajustesGrupoEnum
})

export type AjustesPersonalizadoGet = z.infer<typeof ajustesPersonalizadosGetSchema>
export type AjustesPersonalizadoSave = z.infer<typeof ajustesPersonalizadoSaveSchema>
export type AjustesPersonalizadoDelete = z.infer<typeof ajustesPersonalizadoDeleteSchema>

export interface AjustePersonalizadoFila {
  ambito: AjustesAmbito
  objetivo: string
  grupo: string
  datosJson: string
  actualizadoEn: string
  usuarioId: number | null
}

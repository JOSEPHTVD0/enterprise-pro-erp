import { z } from 'zod'

/**
 * Zod 4 no vuelve a validar el valor entregado a `.default()`.
 * Este helper conserva la semántica usada por los filtros: si el caller omite
 * el objeto, se parsea `{}` para aplicar también los defaults internos
 * (por ejemplo `limite: 300`), no solo el objeto vacío literal.
 */
export function conDefaultsDeObjetoVacio<T extends z.ZodType>(esquema: T): z.ZodDefault<T> {
  // Zod 4 tipa el valor como `NoUndefined<output<T>>`, condición que no se puede
  // satisfacer en una firma genérica; el valor devuelto ya pasó por `parse`.
  return esquema.default(() => esquema.parse({}) as never)
}

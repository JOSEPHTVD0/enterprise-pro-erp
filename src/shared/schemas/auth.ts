import { z } from 'zod'
import { customPermissionKeyPattern, modules, permissionKeys } from '../permissions'

const id = z.number().int().positive()
/**
 * Claves del catálogo fijo o del espacio reservado `custom.*`.
 * La existencia real de un permiso personalizado se comprueba en el servicio.
 */
export const permissionKeySchema = z.string().refine(
  (key) => permissionKeys.includes(key) || customPermissionKeyPattern.test(key),
  'Permiso desconocido.'
)
export const customPermissionKeySchema = z.string().regex(
  customPermissionKeyPattern,
  'La clave debe empezar por custom. y usar letras minúsculas, números o guion bajo (3-40 caracteres).'
)
const moduloSchema = z.enum(modules as unknown as [(typeof modules)[number], ...(typeof modules)[number][]])

export const customPermissionCreateSchema = z.object({
  key: customPermissionKeySchema,
  label: z.string().trim().min(3).max(80),
  descripcion: z.string().trim().min(10, 'Describa para qué sirve el permiso.').max(300),
  module: moduloSchema,
  critico: z.boolean().default(false)
})
const passwordStrong = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .regex(/[A-Z]/, 'Debe incluir una letra mayúscula')
  .regex(/[a-z]/, 'Debe incluir una letra minúscula')
  .regex(/\d/, 'Debe incluir un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir un carácter especial')

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(30),
  password: z.string().min(1),
  empresaId: id.optional()
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordStrong
})

export const userRoleSchema = z.object({ rolId: id, empresaId: id })

export const createUserSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,30}$/, 'Usuario inválido (3-30 caracteres: letras, números, ., _, -)'),
  nombre: z.string().trim().min(2).max(100),
  email: z.union([z.string().email(), z.literal('')]).optional().default(''),
  departamentoId: id.optional().nullable(),
  roles: z.array(userRoleSchema).min(1, 'Asigne al menos un rol'),
  activo: z.boolean().default(true)
})

export const updateUserSchema = createUserSchema.extend({ id })

export const createRoleSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  descripcion: z.string().trim().max(200).default(''),
  permisos: z.array(permissionKeySchema).default([])
})

export const updateRoleSchema = createRoleSchema.extend({ id })

/** Editor administrativo de permisos: claves estrictas y confirmación para permisos sensibles. */
export const rolePermissionsReplaceSchema = z.object({
  rolId: id,
  permisos: z.array(permissionKeySchema),
  confirmarCriticos: z.boolean().default(false),
  motivo: z.string().trim().max(200).default('')
})

export const customPermissionDeleteSchema = z.object({ key: customPermissionKeySchema })

export const createDepartamentoSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  empresaId: id
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type RolePermissionsReplaceInput = z.infer<typeof rolePermissionsReplaceSchema>
export type CustomPermissionInput = z.infer<typeof customPermissionCreateSchema>
export type CustomPermissionDeleteInput = z.infer<typeof customPermissionDeleteSchema>

import { z } from 'zod'

const id = z.number().int().positive()
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
  permisos: z.array(z.string()).default([])
})

export const updateRoleSchema = createRoleSchema.extend({ id, empresaId: id.optional().nullable() })

export const createDepartamentoSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  empresaId: id
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CreateRoleInput = z.infer<typeof createRoleSchema>

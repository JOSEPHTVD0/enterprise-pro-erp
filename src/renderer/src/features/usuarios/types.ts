interface UserRow {
  id: number
  username: string
  nombre: string
  email: string
  activo: number
  bloqueado: number
  debe_cambiar_clave: number
  creado_en: string
  departamento: string | null
  roles: string | null
}

interface RoleRow { id: number; nombre: string; descripcion: string }
interface DepartmentRow { id: number; nombre: string }

export type { UserRow, RoleRow, DepartmentRow }

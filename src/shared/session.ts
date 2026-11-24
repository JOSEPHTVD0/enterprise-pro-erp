/** Contexto de sesión compartido (definido aquí para que el renderer no importe código de main). */
export interface SessionContext {
  token: string
  sesionId: number
  userId: number
  empresaId: number
  username: string
  nombre: string
  empresaNombre: string
  debeCambiarClave: boolean
  permisos: string[]
}

export interface EmpresaOption {
  id: number
  nombre: string
}

export interface LoginResult {
  token?: string
  context?: SessionContext
  debeCambiarClave?: boolean
  empresas?: EmpresaOption[]
}

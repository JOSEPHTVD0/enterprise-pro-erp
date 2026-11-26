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
  /** Marcas de tiempo de la sesión; permiten mostrar el tiempo restante sin exponer el token. */
  iniciaEn?: string
  ultimaActividad?: string
}

/** Lo que el renderer puede ver: el token se guarda solo en el preload. */
export type PublicSessionContext = Omit<SessionContext, 'token'> & {
  /** Empresas a las que este usuario tiene acceso, para el cambio rápido de empresa. */
  empresas?: EmpresaOption[]
}

export interface EmpresaOption {
  id: number
  nombre: string
}

export interface LoginResult {
  token?: string
  context?: PublicSessionContext
  debeCambiarClave?: boolean
  empresas?: EmpresaOption[]
}

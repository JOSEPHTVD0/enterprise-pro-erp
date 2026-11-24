import { create } from 'zustand'
import type { SessionContext, EmpresaOption } from '@shared/session'
import type { SerializedError } from '@shared/api'

interface SessionState {
  status: 'loading' | 'guest' | 'authenticated'
  ctx: SessionContext | null
  mustChangePassword: boolean
  companies: EmpresaOption[]
  hydrate: () => Promise<void>
  login: (username: string, password: string, empresaId?: number) => Promise<void>
  logout: () => Promise<void>
  expire: () => void
  refresh: () => Promise<void>
  clearMustChange: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  ctx: null,
  mustChangePassword: false,
  companies: [],
  hydrate: async () => {
    try {
      const ctx = await window.api.invoke<SessionContext>('auth.me')
      set({ status: 'authenticated', ctx, mustChangePassword: ctx.debeCambiarClave })
    } catch {
      window.api.auth.clearToken()
      set({ status: 'guest', ctx: null })
    }
  },
  login: async (username, password, empresaId) => {
    const res = await window.api.invoke<{
      token: string; context: SessionContext; debeCambiarClave: boolean; empresas: EmpresaOption[]
    }>('auth.login', { username, password, empresaId })
    window.api.auth.setToken(res.token)
    set({
      status: 'authenticated', ctx: res.context,
      mustChangePassword: res.debeCambiarClave, companies: res.empresas ?? []
    })
  },
  logout: async () => {
    try { await window.api.invoke('auth.logout') } catch { /* sesión ya expirada */ }
    window.api.auth.clearToken()
    set({ status: 'guest', ctx: null, mustChangePassword: false, companies: [] })
  },
  expire: () => {
    window.api.auth.clearToken()
    set({ status: 'guest', ctx: null, mustChangePassword: false, companies: [] })
  },
  refresh: async () => {
    try {
      const ctx = await window.api.invoke<SessionContext>('auth.me')
      set({ ctx, mustChangePassword: ctx.debeCambiarClave })
    } catch { /* expirada */ }
  },
  clearMustChange: () => set({ mustChangePassword: false })
}))

export function errorInfo(error: unknown): SerializedError {
  const e = error as Partial<SerializedError>
  return {
    code: e?.code ?? 'UNKNOWN',
    message: e?.message ?? 'Error inesperado',
    data: e?.data
  }
}

/** Comprueba permiso en la UI. El backend vuelve a verificarlo en cada llamada. */
export function can(permiso: string): boolean {
  return useSessionStore.getState().ctx?.permisos.includes(permiso) ?? false
}

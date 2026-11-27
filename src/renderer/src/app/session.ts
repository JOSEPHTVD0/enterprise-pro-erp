import { create } from 'zustand'
import type { PublicSessionContext, EmpresaOption } from '@shared/session'
import type { SerializedError } from '@shared/api'
import { useAppStore } from '@/app/store'

/**
 * Los usuarios operativos semilla entran directamente en su función. El permiso del
 * módulo sigue verificándose en App.tsx; aquí solo se elige la vista inicial.
 */
function vistaInicial(ctx: PublicSessionContext | null): string {
  const permisos = ctx?.permisos ?? []
  if (ctx?.username === 'facturador' && permisos.includes('ventas.consultar')) return 'facturacion'
  if (ctx?.username === 'cobrador' && permisos.includes('cobros.consultar')) return 'cobros'
  return 'dashboard'
}

interface SessionState {
  status: 'loading' | 'guest' | 'authenticated'
  ctx: PublicSessionContext | null
  mustChangePassword: boolean
  companies: EmpresaOption[]
  hydrate: () => Promise<void>
  login: (username: string, password: string, empresaId?: number) => Promise<void>
  switchCompany: (empresaId: number) => Promise<void>
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
      const ctx = await window.api.invoke<PublicSessionContext>('auth.me')
      useAppStore.getState().setActiveView(vistaInicial(ctx))
      set({ status: 'authenticated', ctx, mustChangePassword: ctx.debeCambiarClave, companies: ctx.empresas ?? [] })
    } catch {
      window.api.auth.clearToken()
      set({ status: 'guest', ctx: null })
    }
  },
  login: async (username, password, empresaId) => {
    const res = await window.api.invoke<{
      token: string; context: PublicSessionContext; debeCambiarClave: boolean; empresas: EmpresaOption[]
    }>('auth.login', { username, password, empresaId })
    window.api.auth.setToken(res.token)
    useAppStore.getState().setActiveView(vistaInicial(res.context))
    set({
      status: 'authenticated', ctx: res.context,
      mustChangePassword: res.debeCambiarClave, companies: res.empresas ?? []
    })
  },
  switchCompany: async (empresaId) => {
    const res = await window.api.invoke<{
      token?: string; context?: PublicSessionContext; empresas?: EmpresaOption[]
    }>('auth.switchCompany', empresaId)
    if (res.token) window.api.auth.setToken(res.token)
    useAppStore.getState().setActiveView(vistaInicial(res.context ?? null))
    set({
      status: res.context ? 'authenticated' : 'guest',
      ctx: res.context ?? null,
      companies: res.empresas ?? [],
      mustChangePassword: res.context?.debeCambiarClave ?? false
    })
  },
  logout: async () => {
    try { await window.api.invoke('auth.logout') } catch { /* sesión ya expirada */ }
    window.api.auth.clearToken()
    useAppStore.getState().setActiveView('dashboard')
    set({ status: 'guest', ctx: null, mustChangePassword: false, companies: [] })
  },
  expire: () => {
    window.api.auth.clearToken()
    useAppStore.getState().setActiveView('dashboard')
    set({ status: 'guest', ctx: null, mustChangePassword: false, companies: [] })
  },
  refresh: async () => {
    try {
      const ctx = await window.api.invoke<PublicSessionContext>('auth.me')
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

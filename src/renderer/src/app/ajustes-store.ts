import { create } from 'zustand'
import {
  defaultAjustes, modulosProtegidos, type Ajustes, type AjustesGet, type WidgetId
} from '@shared/schemas/ajustes'

interface AjustesState {
  cargado: boolean
  ajustes: AjustesGet
  cargar: () => Promise<void>
  recargar: () => Promise<void>
  moduloActivo: (id: string) => boolean
  widget: (id: WidgetId) => { visible: boolean; orden: number; ancho: string }
}

const protegidos = new Set<string>(modulosProtegidos)

/** Vistas del renderer que pertenecen a un dominio de permisos compartido. */
const dominioDeVista: Record<string, string> = {
  apariencia: 'configuracion',
  'dashboard-ejecutivo': 'dashboard',
  catalogos: 'configuracion',
  'configuracion-avanzada': 'configuracion',
  'centro-control': 'configuracion',
  usuarios: 'seguridad',
  roles: 'seguridad',
  inteligencia: 'inteligencia'
}

export const useAjustesStore = create<AjustesState>((set, get) => ({
  cargado: false,
  ajustes: {},

  cargar: async () => {
    try {
      const ajustes = await window.api.invoke<AjustesGet>('config.ajustes.get', {})
      set({ ajustes, cargado: true })
    } catch {
      // Sin permiso o sin sesión: se mantienen defaults y se marca como cargado.
      set({ ajustes: {}, cargado: true })
    }
  },

  recargar: async () => {
    try {
      const ajustes = await window.api.invoke<AjustesGet>('config.ajustes.get', {})
      set({ ajustes })
    } catch {
      set({ ajustes: {} })
    }
  },

  moduloActivo: (id) => {
    const estado = get()
    const dominio = dominioDeVista[id] ?? id
    if (protegidos.has(dominio)) return true
    const flag = estado.ajustes.featureFlags?.modulos.find((m) => m.modulo === dominio)
    return flag?.activo ?? true
  },

  widget: (id) => {
    const widgets = get().ajustes.widgets?.widgets ?? defaultAjustes.widgets.widgets
    const found = widgets.find((w) => w.id === id)
    return found ?? { visible: true, orden: 99, ancho: 'MEDIO' }
  }
}))

/** Ajustes completos con defaults, para formularios que editan todos los grupos. */
export function ajustesConDefaults(ajustes: AjustesGet): Ajustes {
  return { ...defaultAjustes, ...ajustes } as Ajustes
}

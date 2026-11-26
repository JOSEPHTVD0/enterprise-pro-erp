import { create } from 'zustand'
import {
  ajustesGrupos, ajustesPorGrupo, defaultAjustes, modulosProtegidos,
  type Ajustes, type AjustesGet, type WidgetId
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

/**
 * Los grupos recibidos por IPC pueden venir de un perfil heredado o de una capa
 * parcial. Los fusionamos con los defaults y validamos cada grupo por separado:
 * un grupo corrupto se descarta por completo sin tumbar el resto de la interfaz.
 */
export function normalizarAjustesEfectivos(ajustes: Partial<Ajustes>): Ajustes {
  const resultado = { ...defaultAjustes } as Record<string, unknown>
  for (const grupo of ajustesGrupos) {
    const parcial = ajustes[grupo]
    if (!parcial || typeof parcial !== 'object' || Array.isArray(parcial)) continue
    const candidato = { ...(defaultAjustes[grupo] as object), ...(parcial as object) }
    const validado = ajustesPorGrupo[grupo].safeParse(candidato)
    if (validado.success) resultado[grupo] = validado.data
  }
  return resultado as Ajustes
}

/** Vistas del renderer que pertenecen a un dominio de permisos compartido. */
const dominioDeVista: Record<string, string> = {
  apariencia: 'configuracion',
  'dashboard-ejecutivo': 'dashboard',
  catalogos: 'configuracion',
  'configuracion-avanzada': 'configuracion',
  'centro-control': 'configuracion',
  usuarios: 'seguridad',
  roles: 'seguridad',
  inteligencia: 'inteligencia',
  'panel-2026': 'inteligencia',
  'capacidades-2026': 'dashboard',
  'espacio-trabajo': 'espacio'
}

export const useAjustesStore = create<AjustesState>((set, get) => ({
  cargado: false,
  ajustes: {},

  cargar: async () => {
    try {
      const ajustes = await window.api.invoke<AjustesGet>('config.ajustes.efectivos')
      set({ ajustes: normalizarAjustesEfectivos(ajustes), cargado: true })
    } catch {
      // Sin sesión: se mantienen defaults y se marca como cargado.
      set({ ajustes: { ...defaultAjustes }, cargado: true })
    }
  },

  recargar: async () => {
    try {
      const ajustes = await window.api.invoke<AjustesGet>('config.ajustes.efectivos')
      set({ ajustes: normalizarAjustesEfectivos(ajustes) })
    } catch {
      set({ ajustes: { ...defaultAjustes } })
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
  return normalizarAjustesEfectivos(ajustes)
}

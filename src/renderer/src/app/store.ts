import { create } from 'zustand'
import { defaultSettings, type Settings } from '@shared/settings'

interface AppState {
  hydrated: boolean
  theme: Settings['theme']
  sidebarCollapsed: boolean
  activeView: string
  hydrate: (settings: Settings) => void
  setTheme: (theme: Settings['theme']) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveView: (id: string) => void
}

/** Persiste apariencia vía IPC (proceso principal escribe en disco). */
function persist(get: () => AppState): void {
  const { theme, sidebarCollapsed } = get()
  void window.api.settings.set({ theme, sidebarCollapsed }).catch(() => {
    // El fallo de persistencia se reporta en la UI de Apariencia al guardar;
    // aquí no interrumpimos la navegación.
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  theme: defaultSettings.theme,
  sidebarCollapsed: defaultSettings.sidebarCollapsed,
  activeView: 'dashboard',
  hydrate: (settings) =>
    set({ hydrated: true, theme: settings.theme, sidebarCollapsed: settings.sidebarCollapsed }),
  setTheme: (theme) => {
    set({ theme })
    persist(get)
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed })
    persist(get)
  },
  setActiveView: (activeView) => set({ activeView })
}))

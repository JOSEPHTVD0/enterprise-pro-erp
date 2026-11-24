import { create } from 'zustand'
import { defaultSettings, type Settings } from '@shared/settings'

interface AppState {
  hydrated: boolean
  settings: Settings
  theme: Settings['theme']
  sidebarCollapsed: boolean
  activeView: string
  hydrate: (settings: Settings) => void
  setSettings: (settings: Settings) => void
  setTheme: (theme: Settings['theme']) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveView: (id: string) => void
}

/** Persiste preferencias vía IPC (el proceso principal escribe en disco). */
function persist(settings: Settings): void {
  void window.api.settings.set(settings).catch(() => {
    // El fallo se reporta en Configuración avanzada; no interrumpe la navegación.
  })
}

function aplicar(set: (parcial: Partial<AppState>) => void, settings: Settings, extra: Partial<AppState> = {}): void {
  set({ settings, theme: settings.theme, sidebarCollapsed: settings.sidebarCollapsed, ...extra })
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  settings: defaultSettings,
  theme: defaultSettings.theme,
  sidebarCollapsed: defaultSettings.sidebarCollapsed,
  activeView: 'dashboard',
  hydrate: (settings) => aplicar(set, settings, { hydrated: true }),
  setSettings: (settings) => {
    aplicar(set, settings)
    persist(settings)
  },
  setTheme: (theme) => {
    const settings: Settings = { ...get().settings, theme }
    aplicar(set, settings)
    persist(settings)
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    const settings: Settings = { ...get().settings, sidebarCollapsed }
    aplicar(set, settings)
    persist(settings)
  },
  setActiveView: (activeView) => set({ activeView })
}))

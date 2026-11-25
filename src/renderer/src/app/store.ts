import { create } from 'zustand'
import { defaultSettings, type Settings } from '@shared/settings'

interface AppState {
  hydrated: boolean
  settings: Settings
  theme: Settings['theme']
  sidebarCollapsed: boolean
  activeView: string
  hydrate: (settings: Settings) => void
  setSettings: (settings: Settings) => Promise<void>
  setTheme: (theme: Settings['theme']) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveView: (id: string) => void
}

/** Persiste preferencias vía IPC (el proceso principal escribe en disco). */
async function persist(settings: Settings): Promise<void> {
  await window.api.settings.set(settings)
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
  setSettings: async (settings) => {
    await persist(settings)
    aplicar(set, settings)
  },
  setTheme: (theme) => {
    const settings: Settings = { ...get().settings, theme }
    aplicar(set, settings)
    void persist(settings).catch(() => undefined)
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    const settings: Settings = { ...get().settings, sidebarCollapsed }
    aplicar(set, settings)
    void persist(settings).catch(() => undefined)
  },
  setActiveView: (activeView) => set({ activeView })
}))

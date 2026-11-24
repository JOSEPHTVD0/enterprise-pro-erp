import { z } from 'zod'

/** Preferencias de apariencia persistidas en disco (proceso principal). */
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  sidebarCollapsed: z.boolean()
})

export type Settings = z.infer<typeof settingsSchema>

export const defaultSettings: Settings = {
  theme: 'system',
  sidebarCollapsed: false
}

/** Resuelve el tema efectivo. Función pura, cubierta por pruebas. */
export function resolveTheme(theme: Settings['theme'], systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light'
  return theme
}

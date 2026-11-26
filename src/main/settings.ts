import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { defaultSettings, settingsSchema, type Settings } from '../shared/settings'

/**
 * Almacén de preferencias en JSON dentro de userData.
 * Escritura atómica (archivo temporal + rename) para resistir cierres inesperados.
 * La base de datos SQLite (Fase 3) vivirá en un almacén separado; esto es solo apariencia.
 */
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    const file = settingsPath()
    if (!existsSync(file)) return { ...defaultSettings }
    const parsed = settingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf-8')))
    return parsed.success ? parsed.data : { ...defaultSettings }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(input: unknown): Settings {
  const settings = settingsSchema.parse(input)
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  // Sufijo por PID: dos instancias pueden guardar preferencias a la vez sin
  // pisar el mismo archivo temporal.
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8')
  renameSync(tmp, file)
  return settings
}

import type { SerializedError } from './api'

const IPC_ERROR_MARKER = 'ERP_IPC_ERROR::'

/**
 * Electron convierte los objetos lanzados desde ipcMain en `Error` y pierde sus propiedades
 * propias. Codificamos el error ya serializado dentro del mensaje para recuperarlo en preload.
 * Este módulo no importa dependencias: se ejecuta dentro del preload sandbox.
 */
export function encodeIpcError(error: SerializedError): Error {
  return new Error(IPC_ERROR_MARKER + JSON.stringify(error))
}

/** Devuelve el error original o `null` si no proviene de nuestro router IPC. */
export function decodeIpcError(error: unknown): SerializedError | null {
  if (!(error instanceof Error)) return null
  // Electron antepone su propio prefijo: "Error invoking remote method 'x': Error: ...".
  const start = error.message.indexOf(IPC_ERROR_MARKER)
  if (start === -1) return null
  const raw = error.message.slice(start + IPC_ERROR_MARKER.length)
  try {
    const parsed = JSON.parse(raw) as SerializedError
    if (typeof parsed?.code !== 'string' || typeof parsed?.message !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

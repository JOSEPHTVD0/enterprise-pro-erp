import type { Settings } from './settings'
import type { AppInfo } from './app-info'
import type { EstadoActualizacion, ProgresoDescarga } from './actualizaciones'

/** Contrato del API expuesto por preload. Implementado en main, consumido por renderer. */
export interface SerializedError {
  code: string
  message: string
  data?: unknown
}

export interface ErpApi {
  settings: {
    get: () => Promise<Settings>
    set: (settings: Settings) => Promise<Settings>
  }
  app: {
    getInfo: () => Promise<AppInfo>
  }
  /** El token de sesión se guarda en el preload; nunca se persiste en disco. */
  auth: {
    setToken: (token: string) => void
    clearToken: () => void
  }
  invoke: <T>(channel: string, input?: unknown) => Promise<T>
  /** Eventos push del proceso principal. Devuelven una función para cancelar la suscripción. */
  onEstadoActualizacion: (callback: (estado: EstadoActualizacion) => void) => () => void
  onProgresoDescarga: (callback: (progreso: ProgresoDescarga) => void) => () => void
}

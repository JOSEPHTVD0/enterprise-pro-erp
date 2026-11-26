import { contextBridge, ipcRenderer } from 'electron'
import type { ErpApi, SerializedError } from '../shared/api'
import { decodeIpcError } from '../shared/ipc-error'
import type { Settings } from '../shared/settings'
import type { AppInfo } from '../shared/app-info'
import type { EstadoActualizacion, ProgresoDescarga } from '../shared/actualizaciones'

/** El token de sesión vive solo en memoria del preload: no se persiste ni se expone a la BD. */
let sessionToken = ''

/**
 * Rechazamos con un objeto plano: `contextBridge` clona las propiedades de los objetos,
 * pero no las propiedades personalizadas de las instancias de `Error`.
 */
function normalize(error: unknown): SerializedError {
  const decoded = decodeIpcError(error)
  if (!decoded) {
    return { code: 'IPC_ERROR', message: 'Error de comunicación con el servidor local.' }
  }
  if (decoded.code === 'UNAUTHORIZED') {
    sessionToken = ''
    window.dispatchEvent(new CustomEvent('erp:unauthorized'))
  }
  return decoded
}

const api: ErpApi = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (settings: Settings): Promise<Settings> => ipcRenderer.invoke('settings:set', settings)
  },
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:get-info')
  },
  auth: {
    setToken: (token: string): void => { sessionToken = token },
    clearToken: (): void => { sessionToken = '' }
  },
  invoke: async <T>(channel: string, input?: unknown): Promise<T> => {
    try {
      return await ipcRenderer.invoke(channel, { token: sessionToken, input }) as T
    } catch (error) {
      throw normalize(error)
    }
  },
  onEstadoActualizacion: (callback) => {
    const escucha = (_evento: Electron.IpcRendererEvent, estado: EstadoActualizacion): void => callback(estado)
    ipcRenderer.on('update.estado', escucha)
    return () => ipcRenderer.removeListener('update.estado', escucha)
  },
  onProgresoDescarga: (callback) => {
    const escucha = (_evento: Electron.IpcRendererEvent, progreso: ProgresoDescarga): void => callback(progreso)
    ipcRenderer.on('update.progreso', escucha)
    return () => ipcRenderer.removeListener('update.progreso', escucha)
  }
}

contextBridge.exposeInMainWorld('api', api)

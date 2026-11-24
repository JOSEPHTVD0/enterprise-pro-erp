import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { EstadoActualizacion } from '@shared/actualizaciones'

/** Contrato mínimo para poder probar el servicio sin descargar nada. */
export interface ActualizadorLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  /** Requerido por electron-updater para permitir pruebas sin empaquetar. */
  forceDevUpdateConfig?: boolean
  setFeedURL(opciones: { provider: 'generic'; url: string }): void
  checkForUpdates(): Promise<{ updateInfo?: { version?: string; releaseNotes?: unknown } | null } | null>
  downloadUpdate(): Promise<string[]>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function crearServicioActualizaciones(
  actualizador: ActualizadorLike,
  urlFeed: string,
  versionActual: string
): {
  estado: () => EstadoActualizacion
  verificar: () => Promise<EstadoActualizacion>
  descargar: () => Promise<EstadoActualizacion>
  instalar: () => void
} {
  const habilitada = urlFeed.trim().length > 0
  let estado: EstadoActualizacion = {
    habilitada, versionActual, verificando: false,
    disponible: false, descargada: false
  }

  if (habilitada) {
    actualizador.autoDownload = false
    actualizador.autoInstallOnAppQuit = true
    actualizador.forceDevUpdateConfig = true
    actualizador.setFeedURL({ provider: 'generic', url: urlFeed.trim() })
  }

  const cambiar = (parcial: Partial<EstadoActualizacion>): EstadoActualizacion => {
    estado = { ...estado, ...parcial }
    return estado
  }

  return {
    estado: () => estado,

    async verificar() {
      if (!habilitada) {
        return cambiar({ error: 'Fuente de actualizaciones no configurada (ERP_UPDATE_URL).' })
      }
      cambiar({ verificando: true, error: undefined })
      try {
        const resultado = await actualizador.checkForUpdates()
        const info = resultado?.updateInfo
        return cambiar({
          verificando: false,
          disponible: !!info?.version,
          version: info?.version,
          notas: typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined,
          descargada: false,
          archivos: undefined
        })
      } catch (error) {
        return cambiar({ verificando: false, error: mensaje(error) })
      }
    },

    async descargar() {
      if (!estado.disponible) throw new Error('No hay una actualización disponible para descargar.')
      try {
        const archivos = await actualizador.downloadUpdate()
        return cambiar({ descargada: true, archivos: archivos.length, error: undefined })
      } catch (error) {
        return cambiar({ error: mensaje(error) })
      }
    },

    instalar() {
      if (!estado.descargada) throw new Error('Descargue la actualización antes de instalarla.')
      actualizador.quitAndInstall(false, true)
    }
  }
}

/** Canales básicos: usan el mismo `isTrusted` que el resto del proceso principal. */
export function registrarIpcActualizaciones(
  ipcMain: IpcMain,
  esConfiable: (evento: IpcMainInvokeEvent) => boolean,
  servicio: ReturnType<typeof crearServicioActualizaciones>
): void {
  const proteger = <T>(evento: IpcMainInvokeEvent, accion: () => T): T => {
    if (!esConfiable(evento)) throw new Error('Origen IPC no autorizado')
    return accion()
  }

  ipcMain.handle('update.estado', (evento) => proteger(evento, () => servicio.estado()))
  ipcMain.handle('update.verificar', (evento) => proteger(evento, () => servicio.verificar()))
  ipcMain.handle('update.descargar', (evento) => proteger(evento, () => servicio.descargar()))
  ipcMain.handle('update.instalar', (evento) => proteger(evento, () => servicio.instalar()))
}

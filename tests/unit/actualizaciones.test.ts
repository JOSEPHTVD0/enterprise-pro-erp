import { describe, expect, it, vi } from 'vitest'
import {
  crearServicioActualizaciones, registrarIpcActualizaciones, type ActualizadorLike
} from '../../src/main/services/updater.service'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

function actualizador(overrides: Partial<ActualizadorLike> = {}): ActualizadorLike & {
  configuraciones: unknown[]
  instalaciones: boolean[]
} {
  const configuraciones: unknown[] = []
  const instalaciones: boolean[] = []
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    setFeedURL: (opciones) => configuraciones.push(opciones),
    checkForUpdates: async () => ({ updateInfo: { version: '0.2.1', releaseNotes: 'Correcciones' } }),
    downloadUpdate: async () => ['installer.exe'],
    quitAndInstall: (silencioso, forzar) => instalaciones.push(!!silencioso || !!forzar),
    configuraciones,
    instalaciones,
    ...overrides
  }
}

describe('actualizaciones automáticas', () => {
  it('desactiva el feed sin URL y no configura el actualizador', async () => {
    const updater = actualizador()
    const servicio = crearServicioActualizaciones(updater, '', '0.2.0')
    const estado = await servicio.verificar()
    expect(estado.habilitada).toBe(false)
    expect(estado.error).toMatch(/no configurada/)
    expect(updater.configuraciones).toHaveLength(0)
  })

  it('configura generic, detecta versión, descarga e instala', async () => {
    const updater = actualizador()
    const servicio = crearServicioActualizaciones(updater, ' http://127.0.0.1:8080/ ', '0.2.0')
    expect(updater.autoDownload).toBe(false)
    expect(updater.forceDevUpdateConfig).toBe(true)
    expect(updater.configuraciones).toEqual([{ provider: 'generic', url: 'http://127.0.0.1:8080/' }])

    const detectado = await servicio.verificar()
    expect(detectado).toMatchObject({ disponible: true, version: '0.2.1', notas: 'Correcciones' })

    const descargado = await servicio.descargar()
    expect(descargado).toMatchObject({ descargada: true, archivos: 1 })

    servicio.instalar()
    expect(updater.instalaciones).toEqual([true])
  })

  it('no instala sin descarga previa', () => {
    const servicio = crearServicioActualizaciones(actualizador(), 'http://127.0.0.1:8080/', '0.2.0')
    expect(() => servicio.instalar()).toThrow(/Descargue/)
  })

  it('convierte errores del feed en estado sin romper la app', async () => {
    const updater = actualizador({ checkForUpdates: async () => { throw new Error('Feed caído') } })
    const servicio = crearServicioActualizaciones(updater, 'http://127.0.0.1:8080/', '0.2.0')
    const estado = await servicio.verificar()
    expect(estado).toMatchObject({ verificando: false, error: 'Feed caído', disponible: false })
  })

  it('protege los cuatro canales IPC con isTrusted', () => {
    const manejadores = new Map<string, (evento: IpcMainInvokeEvent) => unknown>()
    const ipcMain = { handle: (canal: string, manejador: (evento: IpcMainInvokeEvent) => unknown) => {
      manejadores.set(canal, manejador)
    } } as unknown as IpcMain
    const servicio = crearServicioActualizaciones(actualizador(), 'http://127.0.0.1:8080/', '0.2.0')
    registrarIpcActualizaciones(ipcMain, () => false, servicio)

    expect([...manejadores.keys()]).toEqual([
      'update.estado', 'update.verificar', 'update.descargar', 'update.instalar'
    ])
    for (const manejador of manejadores.values()) {
      expect(() => manejador({} as IpcMainInvokeEvent)).toThrow(/no autorizado/)
    }

    const verificador = vi.fn(() => Promise.resolve(servicio.estado()))
    registrarIpcActualizaciones(ipcMain, () => true, { ...servicio, verificar: verificador })
    void manejadores.get('update.verificar')!({} as IpcMainInvokeEvent)
    expect(verificador).toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  crearServicioActualizaciones, registrarIpcActualizaciones, urlFeedActualizacion,
  debeBuscarAlIniciar, esVersionDelCanal, opcionesDeSettings,
  type ActualizadorLike, type AlmacenamientoActualizacion
} from '../../src/main/services/updater.service'
import { URL_FEED_PUBLICADO } from '@shared/actualizaciones'
import { defaultSettings } from '@shared/settings'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

const temporales: string[] = []

afterEach(async () => {
  await Promise.all(temporales.splice(0).map((ruta) => rm(ruta, { recursive: true, force: true })))
})

async function crearAlmacenamiento(): Promise<{
  almacenamiento: AlmacenamientoActualizacion
  destino: string
  origen: string
  mostrarArchivo: ReturnType<typeof vi.fn>
}> {
  const raiz = await mkdtemp(join(tmpdir(), 'erp-updater-test-'))
  temporales.push(raiz)
  const destino = join(raiz, 'Descargas')
  const origen = join(raiz, 'origen', 'EnterpriseProERP-Setup-0.2.1.exe')
  await mkdir(dirname(origen), { recursive: true })
  await writeFile(origen, 'instalador de prueba')
  const mostrarArchivo = vi.fn()
  return { almacenamiento: { carpeta: destino, mostrarArchivo }, destino, origen, mostrarArchivo }
}

function actualizador(
  origen = 'installer.exe',
  overrides: Partial<ActualizadorLike> = {}
): ActualizadorLike & { configuraciones: unknown[] } {
  const configuraciones: unknown[] = []
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    setFeedURL: (opciones) => configuraciones.push(opciones),
    checkForUpdates: async () => ({ updateInfo: { version: '0.2.1', releaseNotes: 'Correcciones' } }),
    downloadUpdate: async () => [origen],
    verifyUpdateCodeSignature: async () => null,
    configuraciones,
    ...overrides
  }
}

describe('actualizaciones con descarga local e instalación manual', () => {
  it('usa el feed público incluido en el código aunque el package.json empaquetado no tenga build', () => {
    const previa = process.env['ERP_UPDATE_URL']
    delete process.env['ERP_UPDATE_URL']
    try {
      expect(urlFeedActualizacion()).toBe(URL_FEED_PUBLICADO)
      expect(urlFeedActualizacion()).toMatch(/^https:\/\/github\.com\/.+\/releases\/latest\/download\/$/)
      process.env['ERP_UPDATE_URL'] = ' https://feed.interno/ '
      expect(urlFeedActualizacion()).toBe('https://feed.interno/')
    } finally {
      if (previa === undefined) delete process.env['ERP_UPDATE_URL']
      else process.env['ERP_UPDATE_URL'] = previa
    }
  })

  it('desactiva el feed sin URL y no configura el actualizador', async () => {
    const { almacenamiento } = await crearAlmacenamiento()
    const updater = actualizador()
    const servicio = crearServicioActualizaciones(updater, '', '0.2.0', {}, {}, almacenamiento)
    const estado = await servicio.verificar()
    expect(estado.habilitada).toBe(false)
    expect(estado.error).toMatch(/no configurada/)
    expect(updater.configuraciones).toHaveLength(0)
  })

  it('configura generic, detecta versión y guarda el instalador sin instalarlo', async () => {
    const { almacenamiento, destino, origen, mostrarArchivo } = await crearAlmacenamiento()
    const verificarFirma = vi.fn(async () => null)
    const updater = actualizador(origen, { verifyUpdateCodeSignature: verificarFirma })
    const servicio = crearServicioActualizaciones(
      updater, ' http://127.0.0.1:8080/ ', '0.2.0', {}, {}, almacenamiento
    )
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.forceDevUpdateConfig).toBe(true)
    expect(updater.configuraciones).toEqual([{ provider: 'generic', url: 'http://127.0.0.1:8080/' }])
    expect(updater.verifyUpdateCodeSignature).not.toBe(verificarFirma)

    const detectado = await servicio.verificar()
    expect(detectado).toMatchObject({
      verificado: true, actualizado: false, disponible: true, version: '0.2.1', notas: 'Correcciones'
    })

    const descargado = await servicio.descargar()
    const esperado = join(destino, 'EnterpriseProERP-Setup-0.2.1.exe')
    expect(descargado).toMatchObject({
      descargada: true, archivos: 1, rutaInstalador: esperado
    })
    expect(existsSync(esperado)).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect('instalar' in servicio).toBe(false)

    servicio.abrirCarpeta()
    expect(mostrarArchivo).toHaveBeenCalledWith(esperado)
  })

  it('marca como verificada una instalación que ya está al día y prohíbe la descarga', async () => {
    const { almacenamiento } = await crearAlmacenamiento()
    const updater = actualizador('installer.exe', {
      checkForUpdates: async () => ({ updateInfo: null }),
      downloadUpdate: vi.fn(async () => ['installer.exe'])
    })
    const servicio = crearServicioActualizaciones(
      updater, 'http://127.0.0.1:8080/', '0.2.0', {},
      { canal: 'ESTABLE', descargaAutomatica: true }, almacenamiento
    )
    const estado = await servicio.verificar()
    expect(estado).toMatchObject({
      verificado: true, actualizado: true, disponible: false, descargada: false, versionActual: '0.2.0'
    })
    await expect(servicio.descargar()).rejects.toThrow(/actualizada.*No hay nada que descargar/)
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('notifica el progreso normalizado y cierra la descarga al 100%', async () => {
    const { almacenamiento, origen } = await crearAlmacenamiento()
    let escucha: ((datos: {
      percent?: number; transferred?: number; total?: number; bytesPerSecond?: number
    }) => void) | undefined
    const updater = actualizador(origen, {
      on: (_evento, oyente) => { escucha = oyente }
    })
    const progresos: unknown[] = []
    const estados: unknown[] = []
    const servicio = crearServicioActualizaciones(
      updater, 'http://127.0.0.1:8080/', '0.2.0', {
        progreso: (p) => progresos.push(p),
        estado: (e) => estados.push(e)
      }, {}, almacenamiento
    )

    await servicio.verificar()
    escucha?.({ percent: 42.4, transferred: 424, total: 1000, bytesPerSecond: 2048 })
    const descargado = await servicio.descargar()

    expect(progresos[0]).toMatchObject({
      porcentaje: 42, transferido: 424, total: 1000, velocidad: 2048
    })
    expect(progresos.at(-1)).toMatchObject({
      porcentaje: 100, transferido: 1000, total: 1000
    })
    expect(descargado).toMatchObject({ descargada: true, archivos: 1 })
    expect(estados.at(-1)).toMatchObject({ descargada: true })
  })

  it('no abre la carpeta sin descarga previa', async () => {
    const { almacenamiento } = await crearAlmacenamiento()
    const servicio = crearServicioActualizaciones(
      actualizador(), 'http://127.0.0.1:8080/', '0.2.0', {}, {}, almacenamiento
    )
    expect(() => servicio.abrirCarpeta()).toThrow(/Descargue/)
  })

  it('no sobrescribe un instalador ya guardado', async () => {
    const { almacenamiento, destino, origen } = await crearAlmacenamiento()
    await mkdir(destino, { recursive: true })
    await writeFile(join(destino, 'EnterpriseProERP-Setup-0.2.1.exe'), 'anterior')
    const servicio = crearServicioActualizaciones(
      actualizador(origen), 'http://127.0.0.1:8080/', '0.2.0', {}, {}, almacenamiento
    )
    await servicio.verificar()
    const estado = await servicio.descargar()
    expect(estado.rutaInstalador).toBe(join(destino, 'EnterpriseProERP-Setup-0.2.1-1.exe'))
    expect(existsSync(join(destino, 'EnterpriseProERP-Setup-0.2.1.exe'))).toBe(true)
  })

  it('convierte errores del feed en estado sin romper la app', async () => {
    const { almacenamiento } = await crearAlmacenamiento()
    const updater = actualizador('installer.exe', {
      checkForUpdates: async () => { throw new Error('Feed caído') }
    })
    const servicio = crearServicioActualizaciones(
      updater, 'http://127.0.0.1:8080/', '0.2.0', {}, {}, almacenamiento
    )
    const estado = await servicio.verificar()
    expect(estado).toMatchObject({
      verificando: false, actualizado: false, error: 'Feed caído', disponible: false
    })
  })

  it('protege los canales IPC con isTrusted y nunca expone update.instalar', async () => {
    const { almacenamiento } = await crearAlmacenamiento()
    const manejadores = new Map<string, (evento: IpcMainInvokeEvent) => unknown>()
    const ipcMain = { handle: (canal: string, manejador: (evento: IpcMainInvokeEvent) => unknown) => {
      manejadores.set(canal, manejador)
    } } as unknown as IpcMain
    const servicio = crearServicioActualizaciones(
      actualizador(), 'http://127.0.0.1:8080/', '0.2.0', {}, {}, almacenamiento
    )
    registrarIpcActualizaciones(ipcMain, () => false, servicio)

    expect([...manejadores.keys()]).toEqual([
      'update.estado', 'update.verificar', 'update.descargar', 'update.abrirCarpeta'
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

describe('políticas de settings.actualizaciones', () => {
  it('ESTABLE ignora betas y BETA las acepta sin cambiar el feed', async () => {
    expect(esVersionDelCanal('0.6.0', 'ESTABLE')).toBe(true)
    expect(esVersionDelCanal('0.6.0-beta.1', 'ESTABLE')).toBe(false)
    expect(esVersionDelCanal('v0.6.0-BETA', 'ESTABLE')).toBe(false)
    expect(esVersionDelCanal('0.6.0-beta.1', 'BETA')).toBe(true)

    const { almacenamiento } = await crearAlmacenamiento()
    const updater = actualizador('installer.exe', {
      checkForUpdates: async () => ({ updateInfo: { version: '0.6.0-beta.1' } })
    })
    const servicio = crearServicioActualizaciones(
      updater, URL_FEED_PUBLICADO, '0.5.7', {},
      opcionesDeSettings({ ...defaultSettings.actualizaciones, canal: 'ESTABLE' }), almacenamiento
    )
    const estado = await servicio.verificar()
    expect(estado).toMatchObject({
      verificado: true, actualizado: false, disponible: false, version: undefined
    })
    expect(updater.configuraciones).toEqual([{ provider: 'generic', url: URL_FEED_PUBLICADO }])
  })

  it('guarda automáticamente el instalador sin instalarlo cuando descargaAutomatica está activa', async () => {
    const { almacenamiento, origen } = await crearAlmacenamiento()
    const updater = actualizador(origen)
    const servicio = crearServicioActualizaciones(
      updater, URL_FEED_PUBLICADO, '0.2.0', {},
      { canal: 'ESTABLE', descargaAutomatica: true }, almacenamiento
    )
    expect(await servicio.verificar()).toMatchObject({
      verificado: true, disponible: true, descargada: true, archivos: 1
    })
    expect(updater.autoInstallOnAppQuit).toBe(false)
  })

  it('nunca descarga automáticamente una versión descartada por el canal', async () => {
    const { almacenamiento } = await crearAlmacenamiento()
    const downloadUpdate = vi.fn(async () => ['installer.exe'])
    const updater = actualizador('installer.exe', {
      checkForUpdates: async () => ({ updateInfo: { version: '0.9.0-BETA' } }),
      downloadUpdate
    })
    const estado = await crearServicioActualizaciones(
      updater, URL_FEED_PUBLICADO, '0.2.0', {},
      { canal: 'ESTABLE', descargaAutomatica: true }, almacenamiento
    ).verificar()
    expect(estado).toMatchObject({
      verificado: true, actualizado: false, disponible: false, descargada: false
    })
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it('notificarVersiones=false calla los eventos pero mantiene el estado consultable', async () => {
    const { almacenamiento, origen } = await crearAlmacenamiento()
    const estados: unknown[] = []
    const progresos: unknown[] = []
    const servicio = crearServicioActualizaciones(
      actualizador(origen), URL_FEED_PUBLICADO, '0.2.0', {
        estado: (e) => estados.push(e),
        progreso: (p) => progresos.push(p)
      }, { notificarVersiones: false }, almacenamiento
    )
    await servicio.verificar()
    await servicio.descargar()
    expect(estados).toHaveLength(0)
    expect(progresos).toHaveLength(0)
    expect(servicio.estado()).toMatchObject({ disponible: true, descargada: true })
  })

  it('buscarAlIniciar solo programa la verificación en app instalada', () => {
    const activas = { ...defaultSettings.actualizaciones, buscarAlIniciar: true }
    expect(debeBuscarAlIniciar(activas, true)).toBe(true)
    expect(debeBuscarAlIniciar(activas, false)).toBe(false)
    expect(debeBuscarAlIniciar(defaultSettings.actualizaciones, false)).toBe(false)
  })
})

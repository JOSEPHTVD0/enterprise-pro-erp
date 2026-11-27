import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, settingsSchema } from '@shared/settings'
import {
  impresionEjecutarSchema, opcionesImpresionSchema
} from '@shared/schemas/impresion'
import { createImpresionService } from '../../src/main/services/impresion.service'
import {
  esperarAreaImpresion, imprimirDocumento, listarImpresoras
} from '../../src/renderer/src/lib/impresion'

vi.mock('@/app/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: {
        impresion: {
          impresora: '',
          modo: 'SILENCIOSA',
          copias: 1,
          formato: 'CARTA',
          color: true,
          fondo: true,
          orientacion: 'VERTICAL',
          incluirLogo: true,
          incluirPie: true,
          margenMm: 12,
          impresionAutomatica: false,
          impresorasPorDocumento: {},
          modosPorDocumento: {}
        }
      }
    })
  }
}))

vi.mock('../../src/renderer/src/lib/formato-impresion', () => ({
  aplicarPreferenciasImpresion: vi.fn(),
  normalizarFormato: (valor: unknown) => valor || 'CARTA'
}))

type WebContentsLike = Parameters<typeof createImpresionService>[0] extends () => infer T ? NonNullable<T> : never

function webContentsFake(
  impresoras: Record<string, unknown>[],
  print: ReturnType<typeof vi.fn> = vi.fn((_opciones: unknown, callback: (ok: boolean) => void) => callback(true))
) {
  const wc = {
    isDestroyed: () => false,
    getPrintersAsync: vi.fn(async () => impresoras),
    print
  }
  return { wc: wc as unknown as WebContentsLike, print }
}

function observadorFalso() {
  const notificaciones: ((registros: MutationRecord[]) => void)[] = []
  class Observador {
    constructor(callback: (registros: MutationRecord[]) => void) { notificaciones.push(callback) }
    observe = vi.fn()
    disconnect = vi.fn()
  }
  vi.stubGlobal('MutationObserver', Observador)
  return notificaciones
}

function documentoFalso(contenido = '') {
  const area = {
    textContent: contenido,
    childElementCount: contenido ? 1 : 0
  } as unknown as Element
  const doc = {
    body: {},
    querySelector: vi.fn(() => area)
  } as unknown as Document
  return { doc, area }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('impresión nativa del sistema', () => {
  it('detecta impresoras reales y prioriza la predeterminada', async () => {
    const { wc } = webContentsFake([
      { name: 'PDF', displayName: 'Microsoft Print to PDF', description: 'Puerto virtual' },
      {
        name: 'EPSON_L321', displayName: 'EPSON L321', description: 'USB001',
        isDefault: true, status: 4
      }
    ])
    const servicio = createImpresionService(() => wc)
    const lista = await servicio.listar()

    expect(lista).toHaveLength(2)
    expect(lista[0]).toMatchObject({ name: 'EPSON_L321', isDefault: true, status: 4 })
    expect(lista[1]).toMatchObject({ name: 'PDF', displayName: 'Microsoft Print to PDF' })
  })

  it('devuelve un arreglo vacío si webContents no está disponible', async () => {
    const sinVentana = createImpresionService(() => null)
    const destruida = createImpresionService(
      () => ({ isDestroyed: () => true } as unknown as WebContentsLike)
    )
    const queFalla = createImpresionService(() => { throw new Error('Ventana cerrada') })
    const sinApi = createImpresionService(
      () => ({ isDestroyed: () => false } as unknown as WebContentsLike)
    )
    const queRechaza = createImpresionService(() => ({
      isDestroyed: () => false,
      getPrintersAsync: () => Promise.reject(new Error('Sin servicio de impresión'))
    } as unknown as WebContentsLike))
    const queLanza = createImpresionService(() => ({
      isDestroyed: () => false,
      getPrintersAsync: () => { throw new Error('Electron no disponible') }
    } as unknown as WebContentsLike))

    expect(await sinVentana.listar()).toEqual([])
    expect(await destruida.listar()).toEqual([])
    expect(await queFalla.listar()).toEqual([])
    expect(await sinApi.listar()).toEqual([])
    expect(await queRechaza.listar()).toEqual([])
    expect(await queLanza.listar()).toEqual([])
  })

  it('envía la impresora elegida y las opciones validadas a webContents.print', async () => {
    const { wc, print } = webContentsFake([])
    const servicio = createImpresionService(() => wc)
    const resultado = await servicio.ejecutar({
      opciones: {
        impresora: 'Brother_QL_820NWB',
        modo: 'SILENCIOSA',
        copias: 2,
        formato: 'TICKET_80',
        color: false,
        fondo: true,
        orientacion: 'VERTICAL'
      },
      etiqueta: 'Factura de prueba'
    })

    expect(resultado).toEqual({ ok: true, etiqueta: 'Factura de prueba' })
    expect(print).toHaveBeenCalledTimes(1)
    expect(print.mock.calls[0][0]).toMatchObject({
      silent: true,
      deviceName: 'Brother_QL_820NWB',
      copies: 2,
      printBackground: true,
      color: false,
      landscape: false,
      pageSize: { width: 80000, height: 297000 }
    })
  })

  it('rechaza copias inválidas y aplica defaults sin inventar impresoras', () => {
    expect(opcionesImpresionSchema.parse({}).impresora).toBe('')
    expect(impresionEjecutarSchema.safeParse({ opciones: { copias: 0 } }).success).toBe(false)
    expect(opcionesImpresionSchema.safeParse({ modo: 'INVALIDO' }).success).toBe(false)
  })

  it('persiste modo e impresoras por documento en las preferencias', () => {
    expect(defaultSettings.impresion.modo).toBe('DIALOGO')
    expect(defaultSettings.impresion.impresorasPorDocumento).toEqual({})
    expect(defaultSettings.impresion.modosPorDocumento).toEqual({})
    const migrado = settingsSchema.parse({
      impresion: {
        impresora: 'EPSON_L321',
        impresorasPorDocumento: { FACTURA: 'EPSON_L321' },
        modosPorDocumento: { POS: 'SILENCIOSA' }
      }
    })
    expect(migrado.impresion.impresorasPorDocumento.FACTURA).toBe('EPSON_L321')
    expect(migrado.impresion.modosPorDocumento.POS).toBe('SILENCIOSA')
    expect(migrado.impresion.modo).toBe('DIALOGO')
  })
})

describe('espera real del área de impresión', () => {
  it('continúa en cuanto el área recibe contenido, sin esperar el tope', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    const notificaciones = observadorFalso()
    const { doc, area } = documentoFalso()

    const promesa = esperarAreaImpresion(doc, 500)
    expect(notificaciones).toHaveLength(1)
    area.textContent = 'Factura de prueba'
    notificaciones[0]([])
    await vi.advanceTimersByTimeAsync(10)

    await expect(promesa).resolves.toBeUndefined()
  })

  it('no crea observador si el área ya está pintada', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    const notificaciones = observadorFalso()
    const { doc } = documentoFalso('Contenido previo')

    const promesa = esperarAreaImpresion(doc, 500)
    expect(notificaciones).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(10)

    await expect(promesa).resolves.toBeUndefined()
  })

  it('no cuelga si requestAnimationFrame no dispara (ventana minimizada)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    const { doc } = documentoFalso('Contenido previo')

    const promesa = esperarAreaImpresion(doc, 25)
    await vi.advanceTimersByTimeAsync(30)

    await expect(promesa).resolves.toBeUndefined()
  })

  it('no se bloquea si no hay mutaciones observables', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    observadorFalso()
    const { doc } = documentoFalso()

    const promesa = esperarAreaImpresion(doc, 30)
    await vi.advanceTimersByTimeAsync(50)

    await expect(promesa).resolves.toBeUndefined()
  })

  it('ignora mutaciones que no llenan el área de impresión', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    const notificaciones = observadorFalso()
    const { doc } = documentoFalso()

    let resuelta = false
    const promesa = esperarAreaImpresion(doc, 30).then(() => { resuelta = true })
    notificaciones[0]([])
    await vi.advanceTimersByTimeAsync(10)
    expect(resuelta).toBe(false)

    await vi.advanceTimersByTimeAsync(30)
    await promesa
    expect(resuelta).toBe(true)
  })

  it('no invoca al motor nativo antes de que el área esté lista', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    const invoke = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('window', { api: { invoke } })
    const { doc, area } = documentoFalso()
    vi.stubGlobal('document', doc)
    const notificaciones = observadorFalso()

    const promesa = imprimirDocumento('FACTURA')
    expect(invoke).not.toHaveBeenCalled()
    expect(notificaciones).toHaveLength(1)

    area.textContent = 'Factura lista'
    notificaciones[0]([])
    await vi.advanceTimersByTimeAsync(10)
    await promesa

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('impresion.ejecutar', {
      opciones: expect.objectContaining({ formato: 'CARTA' }),
      etiqueta: 'FACTURA'
    })
  })

  it('listarImpresoras oculta fallos por defecto y los expone en modo estricto', async () => {
    const invoke = vi.fn(async () => { throw new Error('Sin API de impresión') })
    vi.stubGlobal('window', { api: { invoke } })

    await expect(listarImpresoras()).resolves.toEqual([])
    await expect(listarImpresoras({ estricto: true })).rejects.toThrow('Sin API de impresión')
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenCalledWith('impresoras.listar')
  })
})

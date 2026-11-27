import { describe, expect, it, vi } from 'vitest'
import { defaultSettings, settingsSchema } from '@shared/settings'
import {
  impresionEjecutarSchema, opcionesImpresionSchema
} from '@shared/schemas/impresion'
import { createImpresionService } from '../../src/main/services/impresion.service'

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

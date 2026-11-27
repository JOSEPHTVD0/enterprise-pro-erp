import type { WebContents } from 'electron'
import { errors } from '@shared/errors'
import { formatosImpresion } from '@shared/schemas/ventas'
import {
  impresoraInfoSchema,
  type ImpresionEjecutar,
  type ImpresoraInfo
} from '@shared/schemas/impresion'

/** Tamaños en micras que Chromium acepta para `WebContentsPrintOptions.pageSize`. */
type FormatoImpresion = (typeof formatosImpresion)[number]

const tamaños: Record<FormatoImpresion, 'Letter' | { width: number; height: number }> = {
  CARTA: 'Letter',
  MEDIA: 'Letter',
  TICKET_80: { width: 80000, height: 297000 },
  TICKET_58: { width: 58000, height: 297000 }
}

export interface ResultadoImpresion {
  ok: boolean
  etiqueta: string
  error?: string
}

/**
 * Único puente hacia el subsistema de impresión de Windows. El renderer solo
 * envía opciones validadas; aquí se resuelven las impresoras reales del sistema
 * y se invoca `webContents.print` con el nombre definido por el SO.
 */
export function createImpresionService(obtenerWebContents: () => WebContents | null) {
  /** La consulta de impresoras es best-effort: nunca debe tumbar la configuración. */
  function webContentsDisponible(): WebContents | null {
    try {
      const wc = obtenerWebContents()
      return wc && !wc.isDestroyed() ? wc : null
    } catch {
      return null
    }
  }

  function ventana(): WebContents {
    const wc = webContentsDisponible()
    if (!wc) {
      throw errors.validation('La ventana principal no está disponible para imprimir.')
    }
    return wc
  }

  async function listar(): Promise<ImpresoraInfo[]> {
    const wc = webContentsDisponible()
    if (!wc || typeof wc.getPrintersAsync !== 'function') return []
    let impresoras: Awaited<ReturnType<WebContents['getPrintersAsync']>>
    try {
      impresoras = await wc.getPrintersAsync()
    } catch {
      return []
    }
    return impresoras.map((impresora, indice) => impresoraInfoSchema.parse({
      name: impresora.name,
      displayName: impresora.displayName || impresora.name,
      description: impresora.description || '',
      // Versiones de Electron sin estos campos devuelven la predeterminada primero.
      isDefault: Boolean((impresora as { isDefault?: boolean }).isDefault ?? indice === 0),
      status: Number((impresora as { status?: number }).status ?? 0)
    })).sort((a, b) =>
      Number(b.isDefault) - Number(a.isDefault) || a.displayName.localeCompare(b.displayName)
    )
  }

  function ejecutar(input: ImpresionEjecutar): Promise<ResultadoImpresion> {
    const wc = ventana()
    const { opciones, etiqueta } = input
    const dispositivo = opciones.impresora.trim()

    return new Promise((resolve) => {
      wc.print({
        silent: opciones.modo === 'SILENCIOSA',
        deviceName: dispositivo || undefined,
        printBackground: opciones.fondo,
        color: opciones.color,
        copies: opciones.copias,
        landscape: opciones.orientacion === 'HORIZONTAL',
        pageSize: tamaños[opciones.formato],
        margins: { marginType: 'default' }
      }, (correcto, motivo) => resolve({
        ok: correcto,
        etiqueta,
        error: correcto || !motivo ? undefined : String(motivo)
      }))
    })
  }

  return { listar, ejecutar }
}

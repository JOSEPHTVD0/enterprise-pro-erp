import { formatosImpresion } from '@shared/schemas/ventas'
import type { Settings } from '@shared/settings'
import { useAppStore } from '@/app/store'

export type FormatoImpresion = (typeof formatosImpresion)[number]

const legados: Record<string, FormatoImpresion> = {
  MEDIA_PAGINA: 'MEDIA',
  TICKET80: 'TICKET_80',
  TICKET58: 'TICKET_58'
}

/** Normaliza formatos históricos guardados por versiones anteriores. */
export function normalizarFormato(valor: unknown, fallback: FormatoImpresion = 'CARTA'): FormatoImpresion {
  const texto = String(valor ?? '').trim().toUpperCase()
  if (legados[texto]) return legados[texto]
  return formatosImpresion.includes(texto as FormatoImpresion) ? texto as FormatoImpresion : fallback
}

/** Preferencias de impresión de la estación, ya validadas por `settingsSchema`. */
export function opcionesImpresion(settings: Settings = useAppStore.getState().settings): Settings['impresion'] {
  return settings.impresion
}

/** Formato de la estación, usado como respaldo cuando no hay formato por documento. */
export function formatoPreferido(): FormatoImpresion {
  return normalizarFormato(opcionesImpresion().formato)
}

interface FormatoFila {
  tipoDoc?: unknown
  tipo_doc?: unknown
  formato?: unknown
  copias?: unknown
}

/**
 * Lee el formato configurado para un tipo de documento. Si el usuario no tiene
 * permiso para consultar configuración o no hay formato guardado, conserva el
 * formato de la estación: la impresión nunca se bloquea por esto.
 */
export async function formatoGuardado(
  tipoDoc: string, fallback: FormatoImpresion = formatoPreferido()
): Promise<FormatoImpresion> {
  try {
    const cfg = await window.api.invoke<{ formatos?: FormatoFila[] }>('config.get')
    const fila = (cfg.formatos ?? []).find((item) =>
      String(item.tipoDoc ?? item.tipo_doc ?? '') === tipoDoc
    )
    return fila ? normalizarFormato(fila.formato, fallback) : fallback
  } catch {
    return fallback
  }
}

const ID_ESTILO = 'erp-preferencias-impresion'

function mascaraRnc(valor: string): string {
  if (valor.length <= 4) return '•'.repeat(valor.length)
  return `${valor.slice(0, 3)}${'•'.repeat(Math.max(3, valor.length - 5))}${valor.slice(-2)}`
}

/** Enmascara el RNC del comprobante impreso sin tocar los datos enviados por IPC. */
export function aplicarMascaramientoRnc(activo: boolean): void {
  document.querySelectorAll<HTMLElement>('.print-area p').forEach((parrafo) => {
    const texto = parrafo.textContent ?? ''
    if (!texto.startsWith('RNC:')) return
    if (parrafo.dataset.rncOriginal === undefined) {
      parrafo.dataset.rncOriginal = texto.slice(4).trim()
    }
    const original = parrafo.dataset.rncOriginal ?? ''
    const destino = `RNC: ${activo ? mascaraRnc(original) : original}`
    if (parrafo.textContent !== destino) parrafo.textContent = destino
  })
}

/**
 * Aplica al documento las preferencias que el motor de impresión de Chromium
 * puede honorar: margen de página y visibilidad de logo/pie. La impresora,
 * copias, color y modo se envían al proceso principal desde `lib/impresion`.
 */
export function aplicarPreferenciasImpresion(
  settings: Settings = useAppStore.getState().settings, mascararRnc = false
): void {
  const impresion = opcionesImpresion(settings)
  const root = document.documentElement
  root.dataset.erpImpresionFormato = normalizarFormato(impresion.formato)
  root.dataset.erpImpresionImpresora = impresion.impresora
  root.dataset.erpImpresionAutomatica = String(impresion.impresionAutomatica)
  root.dataset.erpImpresionCopias = String(impresion.copias)
  root.dataset.erpImpresionLogo = String(impresion.incluirLogo)
  root.dataset.erpImpresionPie = String(impresion.incluirPie)
  root.dataset.erpImpresionMargen = String(impresion.margenMm)

  const margen = Math.min(30, Math.max(5, Number(impresion.margenMm) || 12))
  const css = [
    `@page { margin: ${margen}mm; }`,
    "html[data-erp-impresion-logo='false'] .print-area > div > div:first-child { display: none !important; }",
    "html[data-erp-impresion-pie='false'] .print-area > div > p:last-child { display: none !important; }"
  ].join('\n')

  let estilo = document.getElementById(ID_ESTILO) as HTMLStyleElement | null
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = ID_ESTILO
    document.head.appendChild(estilo)
  }
  if (estilo.textContent !== css) estilo.textContent = css
  aplicarMascaramientoRnc(mascararRnc)
}

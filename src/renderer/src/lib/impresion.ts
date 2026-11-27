import type { ImpresoraInfo, OpcionesImpresion } from '@shared/schemas/impresion'
import { useAppStore } from '@/app/store'
import { aplicarPreferenciasImpresion, normalizarFormato } from './formato-impresion'

/**
 * Tope de seguridad, no retardo fijo: en cuanto el DOM del área cambia se sigue
 * adelante. Si no hay mutación observable (por ejemplo, una reimpresión idéntica)
 * se mantiene el margen histórico de 80 ms para no acelerar un render pendiente.
 */
const ESPERA_MAXIMA_AREA_MS = 80

type DocumentoImpresion = Pick<Document, 'body' | 'querySelector'>

/** El área ya está pintada cuando existe y tiene contenido renderizado. */
function areaLista(doc: DocumentoImpresion): boolean {
  const area = doc.querySelector?.('.print-area')
  if (!area) return false
  return Boolean(area.textContent?.trim()) || area.childElementCount > 0
}

function esperarPintado(maxMs = ESPERA_MAXIMA_AREA_MS): Promise<void> {
  return new Promise((resolve) => {
    // Si la ventana está minimizada, rAF puede no disparar: el tope evita colgar.
    const temporizador = setTimeout(resolve, maxMs)
    const listo = () => {
      clearTimeout(temporizador)
      resolve()
    }
    const raf = globalThis.requestAnimationFrame
    if (typeof raf === 'function') {
      raf(() => raf(listo))
    } else {
      setTimeout(() => setTimeout(listo, 0), 0)
    }
  })
}

/**
 * Espera una señal real del DOM: que aparezca `.print-area` o que el nodo ya
 * montado reciba el contenido del documento. Luego espera un frame de pintado.
 * No garantiza por sí sola que React haya sustituido los datos de una impresión
 * anterior; los lotes que encadenan documentos deben forzar el render (como hace
 * CentroImpresionPage con `flushSync`). Se exporta para poder probarla sin DOM.
 */
export async function esperarAreaImpresion(
  doc: DocumentoImpresion = document,
  maxMs = ESPERA_MAXIMA_AREA_MS
): Promise<void> {
  if (!areaLista(doc)) {
    // Si el área aún no tiene contenido, esperamos a que el render la llene.
    await new Promise<void>((resolve) => {
      const Observador = globalThis.MutationObserver
      if (!Observador || !doc.body) {
        setTimeout(resolve, maxMs)
        return
      }
      let observador: MutationObserver | undefined
      const finalizar = () => {
        clearTimeout(temporizador)
        observador?.disconnect()
        resolve()
      }
      const temporizador = setTimeout(finalizar, maxMs)
      observador = new Observador(() => {
        if (areaLista(doc)) finalizar()
      })
      observador.observe(doc.body, {
        childList: true, subtree: true, characterData: true, attributes: true
      })
    })
  }
  await esperarPintado(maxMs)
}

/** Claves estables usadas en la configuración por tipo de documento. */
export const tiposDocumentoImpresion = [
  { id: 'FACTURA', label: 'Facturas y notas de venta' },
  { id: 'COTIZACION', label: 'Cotizaciones' },
  { id: 'POS', label: 'Punto de venta' },
  { id: 'COMPRA', label: 'Compras' },
  { id: 'COBRO', label: 'Cobros y documentos CxC' },
  { id: 'RECIBO', label: 'Recibos y anticipos' },
  { id: 'CXP', label: 'Pagos y documentos CxP' },
  { id: 'BANCO', label: 'Movimientos bancarios' },
  { id: 'CAJA', label: 'Sesiones y movimientos de caja' },
  { id: 'REPORTE', label: 'Reportes' }
] as const

/** Impresoras reales detectadas por Electron en el equipo. Nunca inventa nombres. */
export async function listarImpresoras(
  opciones: { estricto?: boolean } = {}
): Promise<ImpresoraInfo[]> {
  try {
    const lista = await window.api.invoke<ImpresoraInfo[]>('impresoras.listar')
    return Array.isArray(lista) ? lista : []
  } catch (error) {
    if (opciones.estricto) throw error
    return []
  }
}

/** Resuelve la impresora general o la configurada para ese tipo de documento. */
export function opcionesImpresion(
  tipoDoc?: string,
  override: Partial<OpcionesImpresion> = {}
): OpcionesImpresion {
  const preferencias = useAppStore.getState().settings.impresion
  const especifica = tipoDoc ? preferencias.impresorasPorDocumento[tipoDoc] : ''
  const modoEspecifico = tipoDoc ? preferencias.modosPorDocumento[tipoDoc] : undefined
  return {
    impresora: override.impresora ?? (especifica || preferencias.impresora || ''),
    modo: override.modo ?? modoEspecifico ?? preferencias.modo,
    copias: override.copias ?? preferencias.copias,
    formato: override.formato ?? normalizarFormato(preferencias.formato),
    color: override.color ?? preferencias.color,
    fondo: override.fondo ?? preferencias.fondo,
    orientacion: override.orientacion ?? preferencias.orientacion
  }
}

async function ejecutar(opciones: OpcionesImpresion, etiqueta: string): Promise<boolean> {
  aplicarPreferenciasImpresion()
  await esperarAreaImpresion()
  const resultado = await window.api.invoke<{ ok: boolean; error?: string }>('impresion.ejecutar', {
    opciones, etiqueta
  })
  if (!resultado?.ok && resultado?.error) throw new Error(resultado.error)
  return Boolean(resultado?.ok)
}

/** Imprime el área de impresión ya cargada por la página, en la impresora elegida. */
export async function imprimirDocumento(
  tipoDoc?: string,
  override: Partial<OpcionesImpresion> = {}
): Promise<boolean> {
  return ejecutar(opcionesImpresion(tipoDoc, override), tipoDoc ?? '')
}

/**
 * Imprime varios documentos en orden. Cada página prepara su área de impresión
 * antes de continuar, por lo que el lote usa exactamente los mismos datos y
 * permisos que la impresión individual.
 */
export async function imprimirLote<T>(
  documentos: T[],
  preparar: (documento: T) => Promise<void> | void,
  tipoDoc: (documento: T) => string,
  alProgreso?: (impresos: number, total: number) => void
): Promise<number> {
  let impresos = 0
  for (const documento of documentos) {
    await preparar(documento)
    if (await imprimirDocumento(tipoDoc(documento))) impresos += 1
    alProgreso?.(impresos, documentos.length)
  }
  return impresos
}

/** Prueba rápida del equipo sin depender de documentos ni permisos de datos. */
export async function imprimirPrueba(
  override: Partial<OpcionesImpresion> = {}
): Promise<boolean> {
  const area = document.createElement('div')
  area.className = 'print-area'
  area.dataset.erpPrueba = 'true'
  area.style.padding = '24px'
  area.innerHTML = '<div><h1>Enterprise Pro ERP</h1></div><p>Prueba de impresión correcta.</p>'
  const anteriores = [...document.querySelectorAll<HTMLElement>('.print-area:not([data-erp-prueba])')]
  anteriores.forEach((elemento) => { elemento.dataset.erpImpresionOculto = 'true' })
  document.body.appendChild(area)
  try {
    return await ejecutar(opcionesImpresion(undefined, override), 'Prueba de impresión')
  } finally {
    area.remove()
    anteriores.forEach((elemento) => { delete elemento.dataset.erpImpresionOculto })
  }
}

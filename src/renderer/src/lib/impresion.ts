import type { ImpresoraInfo, OpcionesImpresion } from '@shared/schemas/impresion'
import { useAppStore } from '@/app/store'
import { aplicarPreferenciasImpresion, normalizarFormato } from './formato-impresion'

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
export async function listarImpresoras(): Promise<ImpresoraInfo[]> {
  try {
    const lista = await window.api.invoke<ImpresoraInfo[]>('impresoras.listar')
    return Array.isArray(lista) ? lista : []
  } catch {
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
  // El estado React del área de impresión se pinta antes de invocar al motor nativo.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 80))
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

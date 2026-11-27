/** Filtros compartidos por Facturación, Cobros y el panel comercial unificado. */

export interface FiltroComercial {
  numero: string
  cliente: string
  tipo: string
  estado: string
  desde: string
  hasta: string
  montoMin: string
  montoMax: string
  productoId: string
}

export const filtroComercialVacio = (): FiltroComercial => ({
  numero: '', cliente: '', tipo: '', estado: '', desde: '', hasta: '', montoMin: '', montoMax: '', productoId: ''
})

/** Convierte pesos escritos por el usuario a centavos enteros. */
export function aCentavos(valor: string): number | undefined {
  const texto = valor.trim().replace(/,/g, '')
  if (!texto) return undefined
  const numero = Number(texto)
  if (!Number.isFinite(numero) || numero < 0) return undefined
  return Math.round(numero * 100)
}

/** Payload válido para `ventas.documentos`, `cobros.*` y `reportes.*`. */
export function payloadFiltroComercial(filtro: FiltroComercial): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (filtro.numero.trim()) payload.numero = filtro.numero.trim()
  if (filtro.cliente.trim() && /^\d+$/.test(filtro.cliente.trim())) {
    payload.clienteId = Number(filtro.cliente)
    payload.entidadId = Number(filtro.cliente)
  }
  if (filtro.estado) payload.estado = filtro.estado
  if (filtro.tipo) payload.tipo = filtro.tipo
  if (filtro.desde) {
    payload.fechaDesde = filtro.desde
    payload.desde = filtro.desde
  }
  if (filtro.hasta) {
    payload.fechaHasta = filtro.hasta
    payload.hasta = filtro.hasta
  }
  const minimo = aCentavos(filtro.montoMin)
  const maximo = aCentavos(filtro.montoMax)
  if (minimo !== undefined) payload.montoMinCent = minimo
  if (maximo !== undefined) payload.montoMaxCent = maximo
  if (filtro.productoId) payload.productoId = Number(filtro.productoId)
  return payload
}

function texto(valor: unknown): string {
  return valor === undefined || valor === null ? '' : String(valor)
}

function importe(valor: unknown): number | undefined {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim()) {
    const numero = Number(valor)
    if (Number.isFinite(numero)) return numero
  }
  return undefined
}

/**
 * Filtro local de respaldo para listas ya cargadas. El filtro por producto se
 * aplica en backend (las filas no traen las líneas); si la fila trae
 * `productoIds`, también se respeta aquí.
 */
export function coincideFiltroComercial(
  fila: Record<string, unknown>, filtro: FiltroComercial
): boolean {
  const numero = texto(fila.numero ?? fila.numeroDocumento ?? fila.numeroRecibo).toLowerCase()
  const cliente = texto(fila.clienteNombre ?? fila.cliente ?? fila.entidadNombre).toLowerCase()
  const estado = texto(fila.estado).toUpperCase()
  const fecha = texto(fila.fecha)
  const monto = importe(fila.totalCent ?? fila.montoCent ?? fila.saldoCent ?? fila.saldoPendienteCent)
  const minimo = aCentavos(filtro.montoMin)
  const maximo = aCentavos(filtro.montoMax)

  if (filtro.numero.trim() && !numero.includes(filtro.numero.trim().toLowerCase())) return false
  if (filtro.cliente.trim()) {
    const busqueda = filtro.cliente.trim().toLowerCase()
    const coincideCliente = /^\d+$/.test(busqueda)
      ? String(fila.clienteId ?? fila.entidadId ?? '') === busqueda
      : cliente.includes(busqueda)
    if (!coincideCliente) return false
  }
  if (filtro.estado && estado !== filtro.estado.toUpperCase()) return false
  if (filtro.tipo && texto(fila.tipo).toUpperCase() !== filtro.tipo.toUpperCase()) return false
  if (filtro.desde && fecha && fecha < filtro.desde) return false
  if (filtro.hasta && fecha && fecha > filtro.hasta) return false
  if (minimo !== undefined && monto !== undefined && monto < minimo) return false
  if (maximo !== undefined && monto !== undefined && monto > maximo) return false
  if (filtro.productoId) {
    const productos = fila.productoIds
    if (Array.isArray(productos) && !productos.some((id) => String(id) === filtro.productoId)) return false
  }
  return true
}

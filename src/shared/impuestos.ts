import { multiplicarCentavos, redondear } from './dinero'
import { errors } from './errors'

/** Puntos base: 100 bp = 1 %. Toda tasa y descuento se persiste como entero. */
export const BP_POR_UNIDAD = 10000

export interface LineaImponible {
  cantidad: number
  precioCent: number
  descuentoPctBp?: number
  descuentoCent?: number
  tasaBp: number
  exento?: boolean
}

export interface LineaCalculada {
  subtotalCent: number
  descuentoCent: number
  baseCent: number
  impuestoCent: number
  totalCent: number
}

export interface ResumenImponible {
  subtotalCent: number
  descuentoCent: number
  impuestoCent: number
  totalCent: number
}

function validarBp(valor: number, campo: string): number {
  if (!Number.isInteger(valor) || valor < 0 || valor > BP_POR_UNIDAD) {
    throw errors.validation(`${campo} debe estar entre 0 y ${BP_POR_UNIDAD} puntos base.`)
  }
  return valor
}

/** Descuento porcentual o importe fijo. El importe fijo gana si ambos vienen. */
export function calcularDescuento(
  subtotalCent: number,
  descuentoPctBp = 0,
  descuentoCent?: number
): number {
  const base = redondear(subtotalCent)
  if (descuentoCent !== undefined) {
    const fijo = redondear(descuentoCent)
    if (fijo < 0) throw errors.validation('El descuento no puede ser negativo.')
    if (fijo > base) throw errors.validation('El descuento no puede superar el subtotal de la línea.')
    return fijo
  }
  const bp = validarBp(descuentoPctBp, 'El descuento')
  const resultado = multiplicarCentavos(base, bp / BP_POR_UNIDAD)
  return Math.min(resultado, base)
}

/** ITBIS por línea, calculado sobre la base ya descontada. */
export function calcularImpuesto(baseCent: number, tasaBp: number, exento = false): number {
  if (exento) return 0
  return multiplicarCentavos(redondear(baseCent), validarBp(tasaBp, 'La tasa de impuesto') / BP_POR_UNIDAD)
}

/** Calcula una línea completa. Las cantidades se normalizan en `multiplicarCentavos`. */
export function calcularLinea(linea: LineaImponible): LineaCalculada {
  if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
    throw errors.validation('La cantidad de la línea debe ser mayor que cero.')
  }
  if (!Number.isInteger(linea.precioCent) || linea.precioCent < 0) {
    throw errors.validation('El precio de la línea debe ser un importe válido en centavos.')
  }
  const subtotalCent = multiplicarCentavos(linea.precioCent, linea.cantidad)
  const descuentoCent = calcularDescuento(subtotalCent, linea.descuentoPctBp ?? 0, linea.descuentoCent)
  const baseCent = subtotalCent - descuentoCent
  const impuestoCent = calcularImpuesto(baseCent, linea.tasaBp, linea.exento ?? false)
  return {
    subtotalCent,
    descuentoCent,
    baseCent,
    impuestoCent,
    totalCent: baseCent + impuestoCent
  }
}

/** Suma de líneas. El total se recalcula para impedir derivas de redondeo. */
export function resumenLineas(lineas: LineaCalculada[]): ResumenImponible {
  const subtotalCent = lineas.reduce((sum, l) => sum + l.subtotalCent, 0)
  const descuentoCent = lineas.reduce((sum, l) => sum + l.descuentoCent, 0)
  const impuestoCent = lineas.reduce((sum, l) => sum + l.impuestoCent, 0)
  return {
    subtotalCent: redondear(subtotalCent),
    descuentoCent: redondear(descuentoCent),
    impuestoCent: redondear(impuestoCent),
    totalCent: redondear(subtotalCent - descuentoCent + impuestoCent)
  }
}

/** Cambio a devolver en efectivo. Nunca puede ser negativo. */
export function calcularCambio(totalCent: number, pagadoCent: number): number {
  return Math.max(0, redondear(pagadoCent) - redondear(totalCent))
}

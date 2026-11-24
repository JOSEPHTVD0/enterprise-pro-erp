/**
 * Operaciones monetarias centrales, compartidas por main y renderer.
 *
 * Regla del proyecto: TODO el dinero se persiste como `INTEGER` en centavos.
 * Ningún módulo debe usar `Math.round` directamente sobre importes.
 */

function finito(valor: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error('Valor numérico inválido en operación monetaria.')
  }
  return valor
}

/** Redondeo a entero con tolerancia para evitar el error binario de JS. */
export function redondear(valor: number): number {
  const n = finito(valor)
  const resultado = Math.round(n + (n >= 0 ? 1e-9 : -1e-9))
  return Object.is(resultado, -0) ? 0 : resultado
}

/** Convierte un importe decimal (RD$) a centavos enteros. */
export function centavosDesdeDecimal(decimal: number): number {
  const n = finito(decimal)
  const signo = n < 0 ? -1 : 1
  return signo * Math.round(Math.abs(n) * 100 + 1e-9)
}

/** Convierte centavos enteros a importe decimal para presentación. */
export function decimalDesdeCentavos(centavos: number): number {
  return redondear(finito(centavos)) / 100
}

/** Cantidades de inventario: hasta 4 decimales, sin arrastre binario. */
export function redondearCantidad(cantidad: number, decimales = 4): number {
  const n = finito(cantidad)
  const factor = 10 ** decimales
  const signo = n < 0 ? -1 : 1
  const resultado = (Math.round(Math.abs(n) * factor + 1e-9) / factor) * signo
  return Object.is(resultado, -0) ? 0 : resultado
}

/** centavos × cantidad → centavos. La cantidad se normaliza antes de multiplicar. */
export function multiplicarCentavos(centavos: number, cantidad: number, decimales = 4): number {
  return redondear(redondear(finito(centavos)) * redondearCantidad(cantidad, decimales))
}

/** centavos ÷ cantidad → centavos. El divisor debe ser positivo. */
export function dividirCentavos(centavos: number, cantidad: number, decimales = 4): number {
  const divisor = redondearCantidad(cantidad, decimales)
  if (divisor <= 0) throw new Error('El divisor debe ser mayor que cero.')
  return redondear(redondear(finito(centavos)) / divisor)
}

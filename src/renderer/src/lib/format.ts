const moneyFormatter = new Intl.NumberFormat('es-DO', {
  style: 'currency', currency: 'DOP', minimumFractionDigits: 2
})

/** El backend guarda centavos enteros; la UI muestra RD$. */
export function money(centavos: number): string {
  return moneyFormatter.format((Number(centavos) || 0) / 100)
}

export function number(value: unknown): string {
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 4 }).format(Number(value) || 0)
}

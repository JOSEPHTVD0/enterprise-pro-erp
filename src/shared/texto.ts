/** Normalización shared entre renderer y servicios: sin acentos, sin mayúsculas y sin espacios sobrantes. */
export function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'boolean') return valor ? 'si' : 'no'
  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString().toLowerCase()
    return ''
  }
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Divide una consulta en términos. Las comillas dobles permiten buscar una frase
 * literal («"cliente principal"») sin perder búsqueda por partes.
 */
export function tokensBusqueda(texto: string): string[] {
  const partes = texto.match(/"[^"]+"|\S+/g) ?? []
  return partes
    .map((parte) => normalizarTexto(parte.replace(/^"+|"+$/g, '')))
    .filter(Boolean)
}

/** Todos los términos deben aparecer en el texto, sin importar acentos ni mayúsculas. */
export function coincideTexto(valor: unknown, consulta: string): boolean {
  const terminos = tokensBusqueda(consulta)
  if (terminos.length === 0) return true
  const texto = normalizarTexto(valor)
  return terminos.every((termino) => texto.includes(termino))
}

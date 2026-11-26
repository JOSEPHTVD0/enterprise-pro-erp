import { normalizarTexto, tokensBusqueda } from '@shared/texto'

export type OperadorFiltro =
  | 'contiene' | 'igual' | 'distinto' | 'mayor' | 'menor' | 'entre'
  | 'vacio' | 'noVacio'

export interface ReglaFiltro {
  id: string
  columna: string
  operador: OperadorFiltro
  valor: string
  valor2?: string
}

export interface VistaGuardada {
  nombre: string
  busqueda: string
  facetas: Record<string, string>
  reglas: ReglaFiltro[]
  orden: { key: string; asc: boolean } | null
}

export interface ColumnaFiltro<T> {
  key: string
  value?: (fila: T) => string | number
}

export interface AlmacenVistas {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
}

export const operadoresFiltro: {
  value: OperadorFiltro
  label: string
  requiereValor: boolean
  requiereSegundo: boolean
}[] = [
  { value: 'contiene', label: 'Contiene', requiereValor: true, requiereSegundo: false },
  { value: 'igual', label: 'Igual a', requiereValor: true, requiereSegundo: false },
  { value: 'distinto', label: 'Distinto de', requiereValor: true, requiereSegundo: false },
  { value: 'mayor', label: 'Mayor que', requiereValor: true, requiereSegundo: false },
  { value: 'menor', label: 'Menor que', requiereValor: true, requiereSegundo: false },
  { value: 'entre', label: 'Entre', requiereValor: true, requiereSegundo: true },
  { value: 'vacio', label: 'Está vacío', requiereValor: false, requiereSegundo: false },
  { value: 'noVacio', label: 'No está vacío', requiereValor: false, requiereSegundo: false }
]

export function etiquetaOperador(operador: OperadorFiltro): string {
  return operadoresFiltro.find((item) => item.value === operador)?.label ?? operador
}

export function valorCelda<T>(fila: T, clave: string): unknown {
  return clave.split('.').reduce<unknown>((acc, parte) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[parte]
  }, fila)
}

export function valorColumna<T>(fila: T, columna: ColumnaFiltro<T>): unknown {
  const calculado = columna.value?.(fila)
  return calculado === undefined || calculado === null ? valorCelda(fila, columna.key) : calculado
}

export function textoBuscable<T>(fila: T, columnas: ColumnaFiltro<T>[]): string {
  return normalizarTexto(columnas.map((columna) => valorColumna(fila, columna)).join(' '))
}

/** búsqueda por términos: todos deben aparecer en alguna columna, en cualquier orden. */
export function coincideBusqueda<T>(fila: T, columnas: ColumnaFiltro<T>[], busqueda: string): boolean {
  const terminos = tokensBusqueda(busqueda)
  if (terminos.length === 0) return true
  const texto = textoBuscable(fila, columnas)
  return terminos.every((termino) => texto.includes(termino))
}

type ValorComparable = number | string

/** Fechas ISO y números se comparan por su valor; el resto, como texto sin acentos. */
export function valorComparable(valor: unknown): ValorComparable {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : normalizarTexto(valor)
  if (typeof valor === 'boolean') return valor ? 1 : 0
  if (valor instanceof Date) return valor.getTime()
  const texto = String(valor ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(texto)) {
    const fecha = Date.parse(texto.length === 10 ? `${texto}T00:00:00Z` : texto)
    if (Number.isFinite(fecha)) return fecha
  }
  if (/^-?\d+(\.\d+)?$/.test(texto) || /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(texto)) {
    const numero = Number(texto.replaceAll(',', ''))
    if (Number.isFinite(numero)) return numero
  }
  return normalizarTexto(texto)
}

export function compararValores(a: unknown, b: unknown): number {
  const va = valorComparable(a)
  const vb = valorComparable(b)
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
}

export function aplicaRegla<T>(fila: T, columnas: ColumnaFiltro<T>[], regla: ReglaFiltro): boolean {
  const columna = columnas.find((item) => item.key === regla.columna)
  if (!columna) return true
  const valor = valorColumna(fila, columna)
  const texto = normalizarTexto(valor)
  const buscado = normalizarTexto(regla.valor)
  const buscado2 = normalizarTexto(regla.valor2 ?? '')
  const necesitaValor = operadoresFiltro.find((item) => item.value === regla.operador)?.requiereValor
  if (necesitaValor && !buscado) return true
  if (regla.operador === 'entre' && !buscado2) return true

  switch (regla.operador) {
    case 'contiene': return texto.includes(buscado)
    case 'igual': return texto === buscado || compararValores(valor, regla.valor) === 0
    case 'distinto': return texto !== buscado && compararValores(valor, regla.valor) !== 0
    case 'mayor': return compararValores(valor, regla.valor) > 0
    case 'menor': return compararValores(valor, regla.valor) < 0
    case 'entre': return compararValores(valor, regla.valor) >= 0 && compararValores(valor, regla.valor2) <= 0
    case 'vacio': return texto.length === 0
    case 'noVacio': return texto.length > 0
    default: return true
  }
}

export function filtrarFilas<T>(
  filas: T[],
  columnas: ColumnaFiltro<T>[],
  busqueda: string,
  facetas: Record<string, string>,
  reglas: ReglaFiltro[]
): T[] {
  return filas.filter((fila) => {
    if (!coincideBusqueda(fila, columnas, busqueda)) return false
    for (const [clave, valor] of Object.entries(facetas)) {
      if (!valor) continue
      const columna = columnas.find((item) => item.key === clave)
      if (columna && normalizarTexto(valorColumna(fila, columna)) !== normalizarTexto(valor)) return false
    }
    return reglas.every((regla) => aplicaRegla(fila, columnas, regla))
  })
}

export function ordenarFilas<T>(
  filas: T[],
  columnas: ColumnaFiltro<T>[],
  orden: { key: string; asc: boolean } | null
): T[] {
  if (!orden) return filas
  const columna = columnas.find((item) => item.key === orden.key)
  if (!columna) return filas
  return [...filas].sort((a, b) => {
    const comparacion = compararValores(valorColumna(a, columna), valorColumna(b, columna))
    return orden.asc ? comparacion : -comparacion
  })
}

function almacenActual(): AlmacenVistas | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const claveDeVistas = (clave: string): string => `erp-vistas-${clave}`

function esRegla(valor: unknown): valor is ReglaFiltro {
  if (!valor || typeof valor !== 'object') return false
  const regla = valor as Partial<ReglaFiltro>
  return typeof regla.id === 'string' && typeof regla.columna === 'string' &&
    operadoresFiltro.some((item) => item.value === regla.operador) &&
    typeof regla.valor === 'string' && (regla.valor2 === undefined || typeof regla.valor2 === 'string')
}

function esVista(valor: unknown): valor is VistaGuardada {
  if (!valor || typeof valor !== 'object') return false
  const vista = valor as Partial<VistaGuardada>
  const facetasValidas = !!vista.facetas && typeof vista.facetas === 'object' &&
    Object.values(vista.facetas).every((item) => typeof item === 'string')
  const orden = vista.orden
  const ordenValido = orden === null || orden === undefined ||
    (typeof orden === 'object' && typeof orden.key === 'string' && typeof orden.asc === 'boolean')
  return typeof vista.nombre === 'string' && vista.nombre.trim().length > 0 && vista.nombre.length <= 40 &&
    typeof vista.busqueda === 'string' && facetasValidas &&
    Array.isArray(vista.reglas) && vista.reglas.every(esRegla) && ordenValido
}

export function leerVistas(clave: string, almacen: AlmacenVistas | null = almacenActual()): VistaGuardada[] {
  if (!almacen) return []
  try {
    const crudo = almacen.getItem(claveDeVistas(clave))
    if (!crudo) return []
    const datos: unknown = JSON.parse(crudo)
    if (!Array.isArray(datos)) return []
    return datos.filter(esVista).slice(0, 12).map((vista) => ({
      ...vista,
      orden: vista.orden ?? null,
      reglas: vista.reglas.map((regla) => ({ ...regla })),
      facetas: { ...vista.facetas }
    }))
  } catch {
    return []
  }
}

function persistir(clave: string, vistas: VistaGuardada[], almacen: AlmacenVistas | null): VistaGuardada[] {
  try { almacen?.setItem(claveDeVistas(clave), JSON.stringify(vistas)) } catch { /* almacenamiento no disponible */ }
  return vistas
}

export function guardarVista(
  clave: string,
  vista: VistaGuardada,
  almacen: AlmacenVistas | null = almacenActual()
): VistaGuardada[] {
  const actuales = leerVistas(clave, almacen)
    .filter((item) => normalizarTexto(item.nombre) !== normalizarTexto(vista.nombre))
  return persistir(clave, [...actuales, vista].slice(-12), almacen)
}

export function eliminarVista(
  clave: string,
  nombre: string,
  almacen: AlmacenVistas | null = almacenActual()
): VistaGuardada[] {
  return persistir(
    clave,
    leerVistas(clave, almacen).filter((item) => normalizarTexto(item.nombre) !== normalizarTexto(nombre)),
    almacen
  )
}

export function nuevaRegla(columnas: { key: string }[]): ReglaFiltro {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { id, columna: columnas[0]?.key ?? '', operador: 'contiene', valor: '' }
}

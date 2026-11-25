import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Search, ChevronLeft, ChevronRight, Filter, Columns3, Download
} from 'lucide-react'
import { useAjustesStore } from '@/app/ajustes-store'

export interface Column<T> {
  key: string
  header: string
  value?: (row: T) => string | number
  render?: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  searchPlaceholder?: string
  pageSize?: number
  emptyText?: string
  actions?: (row: T) => ReactNode
  /** Identificador estable para recordar qué columnas eligió el usuario. */
  storageKey?: string
}

function texto<T>(fila: T, columna: Column<T>): string {
  const crudo = columna.value?.(fila) ?? (fila as unknown as Record<string, unknown>)[columna.key]
  return String(crudo ?? '')
}

/** Tabla con búsqueda instantánea, filtros por columna, columnas configurables, orden, paginación y CSV. */
export function DataTable<T>({
  columns, data, rowKey, searchPlaceholder = 'Buscar…', pageSize = 10, emptyText = 'No hay registros.',
  actions, storageKey
}: DataTableProps<T>): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null)
  const [page, setPage] = useState(0)
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [mostrarColumnas, setMostrarColumnas] = useState(false)
  const preferencias = useAjustesStore((s) => s.ajustes.widgets)

  const claveTabla = storageKey ?? columns.map((c) => c.key).join('|')
  const claveColumnas = `erp-columnas-${claveTabla}`
  const [ocultas, setOcultas] = useState<Record<string, boolean>>(() => {
    try {
      const guardado = localStorage.getItem(claveColumnas)
      return guardado ? JSON.parse(guardado) as Record<string, boolean> : {}
    } catch { return {} }
  })

  useEffect(() => {
    try { localStorage.setItem(claveColumnas, JSON.stringify(ocultas)) } catch { /* almacenamiento no disponible */ }
  }, [claveColumnas, ocultas])

  const columnasVisibles = useMemo(
    () => columns.filter((c) => !ocultas[c.key]),
    [columns, ocultas]
  )

  const opcionesFiltro = useMemo(() => {
    const resultado: { columna: Column<T>; valores: string[] }[] = []
    for (const columna of columns) {
      const valores = [...new Set(data.map((fila) => texto(fila, columna)).filter(Boolean))]
      if (valores.length > 1 && valores.length <= 12) resultado.push({ columna, valores: valores.sort() })
      if (resultado.length === 6) break
    }
    return resultado
  }, [columns, data])

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filas = q
      ? data.filter((fila) => columns.some((c) => texto(fila, c).toLowerCase().includes(q)))
      : [...data]
    for (const [clave, valor] of Object.entries(filtros)) {
      if (!valor) continue
      const columna = columns.find((c) => c.key === clave)
      if (columna) filas = filas.filter((fila) => texto(fila, columna) === valor)
    }
    if (sort) {
      const columna = columns.find((c) => c.key === sort.key)
      filas = filas.sort((a, b) => {
        if (!columna) return 0
        const va = texto(a, columna)
        const vb = texto(b, columna)
        const cmp = va.localeCompare(vb, 'es', { numeric: true })
        return sort.asc ? cmp : -cmp
      })
    }
    return filas
  }, [columns, data, filtros, search, sort])

  const tamano = preferencias?.tamanoPagina ?? pageSize ?? 10
  const paginas = Math.max(1, Math.ceil(filtradas.length / tamano))
  const actual = Math.min(page, paginas - 1)
  const visibles = filtradas.slice(actual * tamano, actual * tamano + tamano)

  function alternarColumna(clave: string): void {
    setOcultas((prev) => ({ ...prev, [clave]: !prev[clave] }))
  }

  function exportarCsv(): void {
    const escapar = (valor: string): string => `"${valor.replaceAll('"', '""')}"`
    const lineas = [
      columnasVisibles.map((c) => escapar(c.header)).join(','),
      ...filtradas.map((fila) => columnasVisibles.map((c) => escapar(texto(fila, c))).join(','))
    ]
    const blob = new Blob([`\uFEFF${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `${claveTabla.replace(/[^\w-]/g, '_')}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  const boton = 'rounded-md border border-slate-300 p-1.5 text-slate-500 hover:text-indigo-500 dark:border-slate-700'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-72 max-w-full">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="flex items-center gap-2">
          {preferencias?.filtrosAvanzados !== false && opcionesFiltro.length > 0 && (
            <button className={boton} onClick={() => setMostrarFiltros((v) => !v)} title="Filtros por columna" aria-label="Filtros por columna">
              <Filter size={15} />
            </button>
          )}
          {preferencias?.columnasConfigurables !== false && (
            <button className={boton} onClick={() => setMostrarColumnas((v) => !v)} title="Elegir columnas" aria-label="Elegir columnas">
              <Columns3 size={15} />
            </button>
          )}
          {preferencias?.exportarCsv !== false && (
            <button className={boton} onClick={exportarCsv} title="Exportar CSV" aria-label="Exportar CSV">
              <Download size={15} />
            </button>
          )}
          <span className="text-xs text-slate-400">{filtradas.length} registro(s)</span>
        </div>
      </div>

      {(mostrarFiltros || mostrarColumnas) && (
        <div className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50 sm:grid-cols-2 lg:grid-cols-3">
          {mostrarFiltros && opcionesFiltro.map(({ columna, valores }) => (
            <label key={columna.key} className="flex flex-col gap-1">
              <span className="font-medium text-slate-500 dark:text-slate-400">{columna.header}</span>
              <select
                className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
                value={filtros[columna.key] ?? ''}
                onChange={(e) => { setFiltros((prev) => ({ ...prev, [columna.key]: e.target.value })); setPage(0) }}
              >
                <option value="">Todos</option>
                {valores.map((valor) => <option key={valor} value={valor}>{valor}</option>)}
              </select>
            </label>
          ))}
          {mostrarColumnas && columns.map((columna) => (
            <label key={columna.key} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={!ocultas[columna.key]}
                disabled={columnasVisibles.length === 1 && !ocultas[columna.key]}
                onChange={() => alternarColumna(columna.key)}
              />
              {columna.header}
            </label>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              {columnasVisibles.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.className ?? ''}`}>
                  <button
                    className="inline-flex items-center gap-1 hover:text-indigo-500"
                    onClick={() => setSort((s) => ({ key: c.key, asc: s?.key === c.key ? !s.asc : true }))}
                  >
                    {c.header}
                    {sort?.key === c.key && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              {actions && <th className="px-3 py-2.5 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibles.map((fila) => (
              <tr key={rowKey(fila)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                {columnasVisibles.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-2.5 ${c.className ?? ''}`}>
                    {c.render ? c.render(fila) : texto(fila, c)}
                  </td>
                ))}
                {actions && <td className="px-3 py-2.5 text-right">{actions(fila)}</td>}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={columnasVisibles.length + (actions ? 1 : 0)} className="px-3 py-8 text-center text-slate-400">{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <button
          onClick={() => setPage(Math.max(0, actual - 1))}
          disabled={actual === 0}
          className="rounded-md border border-slate-300 p-1 disabled:opacity-40 dark:border-slate-700"
          aria-label="Página anterior"
        ><ChevronLeft size={14} /></button>
        <span>Página {actual + 1} de {paginas}</span>
        <button
          onClick={() => setPage(Math.min(paginas - 1, actual + 1))}
          disabled={actual >= paginas - 1}
          className="rounded-md border border-slate-300 p-1 disabled:opacity-40 dark:border-slate-700"
          aria-label="Página siguiente"
        ><ChevronRight size={14} /></button>
      </div>
    </div>
  )
}

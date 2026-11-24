import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Search, ChevronLeft, ChevronRight } from 'lucide-react'

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
}

/** Tabla reutilizable con búsqueda instantánea, orden y paginación del lado cliente. */
export function DataTable<T>({
  columns, data, rowKey, searchPlaceholder = 'Buscar…', pageSize = 10, emptyText = 'No hay registros.', actions
}: DataTableProps<T>): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = q
      ? data.filter((row) => columns.some((c) => String(c.value?.(row) ?? '').toLowerCase().includes(q)))
      : [...data]
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      rows = rows.sort((a, b) => {
        const va = String(col?.value?.(a) ?? '')
        const vb = String(col?.value?.(b) ?? '')
        const cmp = va.localeCompare(vb, 'es', { numeric: true })
        return sort.asc ? cmp : -cmp
      })
    }
    return rows
  }, [data, columns, search, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative w-72 max-w-full">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} registro(s)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              {columns.map((c) => (
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
            {visible.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-2.5 ${c.className ?? ''}`}>
                    {c.render ? c.render(row) : String(c.value?.(row) ?? '')}
                  </td>
                ))}
                {actions && <td className="px-3 py-2.5 text-right">{actions(row)}</td>}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="px-3 py-8 text-center text-slate-400">{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <button
          onClick={() => setPage(Math.max(0, current - 1))}
          disabled={current === 0}
          className="rounded-md border border-slate-300 p-1 disabled:opacity-40 dark:border-slate-700"
          aria-label="Página anterior"
        ><ChevronLeft size={14} /></button>
        <span>Página {current + 1} de {pages}</span>
        <button
          onClick={() => setPage(Math.min(pages - 1, current + 1))}
          disabled={current >= pages - 1}
          className="rounded-md border border-slate-300 p-1 disabled:opacity-40 dark:border-slate-700"
          aria-label="Página siguiente"
        ><ChevronRight size={14} /></button>
      </div>
    </div>
  )
}

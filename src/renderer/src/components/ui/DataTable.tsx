import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Search, ChevronLeft, ChevronRight, Filter, Columns3, Download,
  SlidersHorizontal, Plus, Trash2, Bookmark, BookmarkPlus, X, RotateCcw
} from 'lucide-react'
import { useAjustesStore } from '@/app/ajustes-store'
import {
  compararValores, eliminarVista, etiquetaOperador, filtrarFilas,
  guardarVista, leerVistas, nuevaRegla, operadoresFiltro, ordenarFilas, valorColumna,
  type ReglaFiltro, type VistaGuardada
} from '@/lib/filtros-avanzados'
import { confirmarEliminacion, titleSi, usePreferenciasInterfaz } from '@/lib/format'
import { SkeletonTable } from './Skeleton'

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
  /** Estado de carga real: sustituye las filas por esqueletos accesibles. */
  loading?: boolean
  /** Estado vacío enriquecido; `emptyText` sigue siendo el fallback. */
  emptyState?: ReactNode
  actions?: (row: T) => ReactNode
  /** Identificador estable para recordar columnas, reglas y vistas guardadas. */
  storageKey?: string
}

function texto<T>(fila: T, columna: Column<T>): string {
  const crudo = valorColumna(fila, columna)
  return crudo === null || crudo === undefined ? '' : String(crudo)
}

/** Tabla con búsqueda por términos, reglas, vistas guardadas, orden, paginación y CSV. */
export function DataTable<T>({
  columns, data, rowKey, searchPlaceholder = 'Buscar…', emptyText = 'No hay registros.',
  loading = false, emptyState, actions, storageKey
}: DataTableProps<T>): React.JSX.Element {
  const preferencias = useAjustesStore((s) => s.ajustes.widgets)
  const preferenciasInterfaz = usePreferenciasInterfaz()
  const title = (texto: string): string | undefined => titleSi(preferenciasInterfaz.tooltips, texto)
  const claveTabla = storageKey ?? columns.map((c) => c.key).join('|')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null)
  const [page, setPage] = useState(0)
  const [facetas, setFacetas] = useState<Record<string, string>>({})
  const [reglas, setReglas] = useState<ReglaFiltro[]>([])
  const [vistas, setVistas] = useState<VistaGuardada[]>(() => leerVistas(claveTabla))
  const [vistaActiva, setVistaActiva] = useState('')
  const [nombreVista, setNombreVista] = useState('')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [mostrarAvanzados, setMostrarAvanzados] = useState(false)
  const [mostrarColumnas, setMostrarColumnas] = useState(false)

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

  useEffect(() => {
    setVistas(leerVistas(claveTabla))
    setSearch('')
    setFacetas({})
    setReglas([])
    setSort(null)
    setVistaActiva('')
    setPage(0)
  }, [claveTabla])

  const columnasVisibles = useMemo(
    () => columns.filter((c) => !ocultas[c.key]),
    [columns, ocultas]
  )

  const opcionesFiltro = useMemo(() => {
    const resultado: { columna: Column<T>; valores: string[] }[] = []
    for (const columna of columns) {
      const valores = [...new Set(data.map((fila) => texto(fila, columna)).filter(Boolean))]
      if (valores.length > 1 && valores.length <= 12) {
        resultado.push({ columna, valores: valores.sort((a, b) => compararValores(a, b)) })
      }
      if (resultado.length === 6) break
    }
    return resultado
  }, [columns, data])

  const filtradas = useMemo(() => {
    const base = filtrarFilas(data, columns, search, facetas, reglas)
    return ordenarFilas(base, columns, sort)
  }, [columns, data, facetas, reglas, search, sort])

  const filtrosActivos = (search.trim() ? 1 : 0)
    + Object.values(facetas).filter(Boolean).length
    + reglas.filter((regla) => {
      const op = operadoresFiltro.find((item) => item.value === regla.operador)
      return !op?.requiereValor || !!regla.valor.trim()
    }).length

  // `settings.interfaz.paginaTamano` y `widgets.tamanoPagina` ya están unificados.
  const tamano = preferenciasInterfaz.paginaTamano
  const paginas = Math.max(1, Math.ceil(filtradas.length / tamano))
  const actual = Math.min(page, paginas - 1)
  const visibles = filtradas.slice(actual * tamano, actual * tamano + tamano)

  function alternarColumna(clave: string): void {
    setOcultas((prev) => ({ ...prev, [clave]: !prev[clave] }))
  }

  function cambiarRegla(id: string, parcial: Partial<ReglaFiltro>): void {
    setReglas((prev) => prev.map((regla) => regla.id === id ? { ...regla, ...parcial } : regla))
    setPage(0)
  }

  function aplicarVista(vista: VistaGuardada): void {
    setSearch(vista.busqueda)
    setFacetas({ ...vista.facetas })
    setReglas(vista.reglas.map((regla) => ({ ...regla })))
    setSort(vista.orden ? { ...vista.orden } : null)
    setVistaActiva(vista.nombre)
    setPage(0)
  }

  function guardarVistaActual(): void {
    const nombre = nombreVista.trim()
    if (!nombre) return
    const vista: VistaGuardada = {
      nombre, busqueda: search, facetas: { ...facetas },
      reglas: reglas.map((regla) => ({ ...regla })), orden: sort
    }
    setVistas(guardarVista(claveTabla, vista))
    setVistaActiva(nombre)
    setNombreVista('')
  }

  function limpiarFiltros(): void {
    setSearch('')
    setFacetas({})
    setReglas([])
    setSort(null)
    setVistaActiva('')
    setPage(0)
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
  const botonActivo = `${boton} border-indigo-400 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50`
  const chip = 'inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-72 max-w-full">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVistaActiva(''); setPage(0) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setPage(0) } }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="flex items-center gap-2">
          {preferencias?.filtrosAvanzados !== false && opcionesFiltro.length > 0 && (
            <button
              className={mostrarFiltros ? botonActivo : boton}
              onClick={() => setMostrarFiltros((v) => !v)}
              title={title('Filtros por columna')}
              aria-label="Filtros por columna"
            ><Filter size={15} /></button>
          )}
          {preferencias?.filtrosAvanzados !== false && (
            <button
              className={mostrarAvanzados ? botonActivo : boton}
              onClick={() => setMostrarAvanzados((v) => !v)}
              title={title('Filtros avanzados y vistas guardadas')}
              aria-label="Filtros avanzados"
            >
              <SlidersHorizontal size={15} />
              {filtrosActivos > 0 && <span className="ml-1 text-[10px] font-semibold">{filtrosActivos}</span>}
            </button>
          )}
          {preferencias?.columnasConfigurables !== false && (
            <button
              className={mostrarColumnas ? botonActivo : boton}
              onClick={() => setMostrarColumnas((v) => !v)}
              title={title('Elegir columnas')}
              aria-label="Elegir columnas"
            ><Columns3 size={15} /></button>
          )}
          {preferencias?.exportarCsv !== false && preferenciasInterfaz.formatosPermitidos.includes('CSV') && (
            <button className={boton} onClick={exportarCsv} title={title('Exportar CSV filtrado')} aria-label="Exportar CSV">
              <Download size={15} />
            </button>
          )}
          <span className="text-xs text-slate-400">{filtradas.length}/{data.length} registro(s)</span>
        </div>
      </div>

      {filtrosActivos > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filtros activos</span>
          {search.trim() && (
            <button className={chip} onClick={() => setSearch('')} title={title('Quitar búsqueda')}>
              «{search}» <X size={11} />
            </button>
          )}
          {Object.entries(facetas).filter(([, valor]) => valor).map(([clave, valor]) => (
            <button
              key={clave}
              className={chip}
              onClick={() => setFacetas((prev) => ({ ...prev, [clave]: '' }))}
              title={title('Quitar filtro de columna')}
            >
              {columns.find((c) => c.key === clave)?.header ?? clave}: {valor} <X size={11} />
            </button>
          ))}
          {reglas.map((regla, indice) => (
            <button
              key={regla.id}
              className={chip}
              onClick={() => setReglas((prev) => prev.filter((item) => item.id !== regla.id))}
              title={title('Quitar condición')}
            >
              {columns.find((c) => c.key === regla.columna)?.header ?? regla.columna}{' '}
              {etiquetaOperador(regla.operador)} {regla.valor || regla.valor2 ? `«${regla.valor}${regla.valor2 ? ` – ${regla.valor2}` : ''}»` : ''}
              {' '}<X size={11} />
              <span className="sr-only">{indice + 1}</span>
            </button>
          ))}
          {vistaActiva && <span className="text-[11px] text-indigo-500">Vista: {vistaActiva}</span>}
          <button
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-slate-500 hover:text-indigo-500"
            onClick={limpiarFiltros}
            aria-label="Limpiar todos los filtros"
          ><RotateCcw size={11} /> Limpiar</button>
        </div>
      )}

      {mostrarAvanzados && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs dark:border-indigo-900 dark:bg-indigo-950/20">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">Condiciones (se aplican todas)</span>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-indigo-300 px-2 py-1 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300"
              onClick={() => { setReglas((prev) => [...prev, nuevaRegla(columns)]); setPage(0) }}
              aria-label="Agregar condición"
            ><Plus size={13} /> Agregar condición</button>
          </div>
          {reglas.length === 0 && (
            <p className="mb-2 text-slate-500">Agregue condiciones para filtrar por columnas, números, fechas o rangos.</p>
          )}
          {reglas.map((regla, indice) => {
            const op = operadoresFiltro.find((item) => item.value === regla.operador)
            return (
              <div key={regla.id} className="mb-2 flex flex-wrap items-end gap-2">
                <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase text-slate-500">Columna {indice + 1}</span>
                  <select
                    className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
                    value={regla.columna}
                    onChange={(e) => cambiarRegla(regla.id, { columna: e.target.value })}
                    aria-label={`Columna de la condición ${indice + 1}`}
                  >
                    {columns.map((columna) => (
                      <option key={columna.key} value={columna.key}>{columna.header}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[120px] flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase text-slate-500">Operador</span>
                  <select
                    className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
                    value={regla.operador}
                    onChange={(e) => cambiarRegla(regla.id, { operador: e.target.value as ReglaFiltro['operador'] })}
                    aria-label={`Operador de la condición ${indice + 1}`}
                  >
                    {operadoresFiltro.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                {op?.requiereValor && (
                  <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase text-slate-500">Valor</span>
                    <input
                      className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
                      value={regla.valor}
                      onChange={(e) => cambiarRegla(regla.id, { valor: e.target.value })}
                      placeholder={regla.operador === 'entre' ? 'Desde' : 'Escriba sin pausa…'}
                      aria-label={`Valor de la condición ${indice + 1}`}
                    />
                  </label>
                )}
                {op?.requiereSegundo && (
                  <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase text-slate-500">Hasta</span>
                    <input
                      className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
                      value={regla.valor2 ?? ''}
                      onChange={(e) => cambiarRegla(regla.id, { valor2: e.target.value })}
                      placeholder="Hasta"
                      aria-label={`Segundo valor de la condición ${indice + 1}`}
                    />
                  </label>
                )}
                <button
                  className="rounded-md border border-slate-300 p-2 text-slate-500 hover:text-rose-500 dark:border-slate-600"
                  onClick={() => { setReglas((prev) => prev.filter((item) => item.id !== regla.id)); setPage(0) }}
                  aria-label={`Quitar condición ${indice + 1}`}
                  title={title('Quitar condición')}
                ><Trash2 size={14} /></button>
              </div>
            )
          })}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-indigo-200 pt-3 dark:border-indigo-900">
            <input
              className="h-8 w-44 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
              value={nombreVista}
              onChange={(e) => setNombreVista(e.target.value)}
              placeholder="Nombre de la vista"
              aria-label="Nombre de la vista"
            />
            <button
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-white disabled:opacity-40"
              onClick={guardarVistaActual}
              disabled={!nombreVista.trim()}
              aria-label="Guardar vista"
            ><BookmarkPlus size={13} /> Guardar vista</button>
            {vistas.map((vista) => (
              <span key={vista.nombre} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white pl-2 text-[11px] dark:border-slate-600 dark:bg-slate-900">
                <button
                  className="inline-flex items-center gap-1 py-0.5 text-indigo-600 dark:text-indigo-300"
                  onClick={() => aplicarVista(vista)}
                  aria-label={`Aplicar vista ${vista.nombre}`}
                ><Bookmark size={11} /> {vista.nombre}</button>
                <button
                  className="px-1 text-slate-400 hover:text-rose-500"
                  onClick={() => {
                    if (!confirmarEliminacion(`¿Eliminar la vista guardada «${vista.nombre}»?`)) return
                    setVistas(eliminarVista(claveTabla, vista.nombre))
                  }}
                  aria-label={`Eliminar vista ${vista.nombre}`}
                ><X size={11} /></button>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            La búsqueda admite varios términos y frases entre comillas; fechas e importes se ordenan por valor.
          </p>
        </div>
      )}

      {(mostrarFiltros || mostrarColumnas) && (
        <div className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50 sm:grid-cols-2 lg:grid-cols-3">
          {mostrarFiltros && opcionesFiltro.map(({ columna, valores }) => (
            <label key={columna.key} className="flex flex-col gap-1">
              <span className="font-medium text-slate-500 dark:text-slate-400">{columna.header}</span>
              <select
                className="h-8 rounded border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
                value={facetas[columna.key] ?? ''}
                onChange={(e) => { setFacetas((prev) => ({ ...prev, [columna.key]: e.target.value })); setVistaActiva(''); setPage(0) }}
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

      <div
        className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        aria-busy={loading}
      >
        {loading ? (
          <SkeletonTable rows={5} cols={Math.max(2, columnasVisibles.length)} />
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{searchPlaceholder}</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                {columnasVisibles.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sort?.key === c.key ? (sort.asc ? 'ascending' : 'descending') : 'none'}
                    className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.className ?? ''}`}
                  >
                    <button
                      className="erp-focus inline-flex items-center gap-1 hover:text-indigo-500"
                      aria-label={`Ordenar por ${c.header}`}
                      onClick={() => { setSort((s) => ({ key: c.key, asc: s?.key === c.key ? !s.asc : true })); setVistaActiva('') }}
                    >
                      {c.header}
                      {sort?.key === c.key && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
                {actions && <th scope="col" className="px-3 py-2.5 text-right">Acciones</th>}
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
                <tr>
                  <td colSpan={columnasVisibles.length + (actions ? 1 : 0)} className="px-3 py-8">
                    {emptyState ?? <p className="text-center text-slate-400 dark:text-slate-500">{emptyText}</p>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <button
          onClick={() => setPage(Math.max(0, actual - 1))}
          disabled={actual === 0}
          className="rounded-md border border-slate-300 p-1 disabled:opacity-40 dark:border-slate-700"
          aria-label="Página anterior"
        ><ChevronLeft size={14} /></button>
        <span aria-current="page">Página {actual + 1} de {paginas}</span>
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

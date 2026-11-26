import { useEffect, useState } from 'react'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Building2, Search, Star } from 'lucide-react'
import { moduleGroups, modulePermission, type ModuleDef } from '@/app/modules'
import { useAppStore } from '@/app/store'
import { useSessionStore } from '@/app/session'
import { useAjustesStore } from '@/app/ajustes-store'
import { defaultAjustes } from '@shared/schemas/ajustes'
import { coincideTexto, normalizarTexto } from '@shared/texto'
import { titleSi, usePreferenciasInterfaz } from '@/lib/format'

interface ModuloMenu {
  id: string
  label: string
  description: string
  features: string[]
  available: boolean
  phase: number
  icon: ModuleDef['icon']
  grupo: string
}

const CLAVE_FAVORITOS = 'erp-favoritos'

function leerFavoritos(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_FAVORITOS)
    const datos: unknown = crudo ? JSON.parse(crudo) : []
    return Array.isArray(datos)
      ? datos.filter((valor): valor is string => typeof valor === 'string').slice(0, 12)
      : []
  } catch {
    return []
  }
}

export function Sidebar(): React.JSX.Element {
  const { sidebarCollapsed, setSidebarCollapsed, activeView, setActiveView } = useAppStore()
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({})
  const [busqueda, setBusqueda] = useState('')
  const [favoritos, setFavoritos] = useState<string[]>(leerFavoritos)
  const moduloActivo = useAjustesStore((s) => s.moduloActivo)
  const buscadorGlobal = useAjustesStore((s) => s.ajustes.widgets?.buscadorGlobal)
  const interfaz = useAjustesStore((s) => s.ajustes.interfaz ?? defaultAjustes.interfaz)
  const preferencias = usePreferenciasInterfaz()
  const anchoSidebar = Math.min(360, Math.max(200, Number(interfaz.anchoSidebar) || 240))
  // Suscribirse a los permisos mantiene el menú alineado tras editar roles.
  const permisos = useSessionStore((s) => s.ctx?.permisos) ?? []

  useEffect(() => {
    try { localStorage.setItem(CLAVE_FAVORITOS, JSON.stringify(favoritos)) } catch { /* almacenamiento no disponible */ }
  }, [favoritos])

  const toggleGroup = (id: string): void =>
    setClosedGroups((s) => ({ ...s, [id]: !s[id] }))

  function alternarFavorito(id: string): void {
    setFavoritos((prev) => prev.includes(id)
      ? prev.filter((item) => item !== id)
      : [...prev, id].slice(-12))
  }

  const q = normalizarTexto(busqueda)
  const ocultarElementos = Array.isArray(interfaz.ocultarElementos)
    ? interfaz.ocultarElementos : defaultAjustes.interfaz.ocultarElementos
  const ordenGrupos = Array.isArray(interfaz.ordenGrupos)
    ? interfaz.ordenGrupos : defaultAjustes.interfaz.ordenGrupos
  const etiquetas = interfaz.etiquetasModulo && typeof interfaz.etiquetasModulo === 'object'
    ? interfaz.etiquetasModulo : defaultAjustes.interfaz.etiquetasModulo
  const ocultos = new Set<string>(ocultarElementos)
  const orden = new Map<string, number>(ordenGrupos.map((id, i) => [id, i]))
  const grupos = moduleGroups.map((grupo) => ({
    ...grupo,
    label: etiquetas[grupo.id] ?? grupo.label,
    modules: grupo.modules.filter((modulo) => {
      const permiso = modulePermission(modulo.id)
      if (permiso && !permisos.includes(permiso)) return false
      if (!moduloActivo(modulo.id)) return false
      if (!q) return true
      const etiqueta = etiquetas[modulo.id] ?? modulo.label
      return coincideTexto(
        `${etiqueta} ${modulo.id} ${modulo.description} ${modulo.features.join(' ')} ${grupo.label}`,
        busqueda
      )
    }).map((modulo) => ({ ...modulo, label: etiquetas[modulo.id] ?? modulo.label }))
  })).filter((grupo) => grupo.modules.length > 0)
    .sort((a, b) => (orden.get(a.id) ?? 99) - (orden.get(b.id) ?? 99))

  const modulosVisibles: ModuloMenu[] = grupos.flatMap((grupo) =>
    grupo.modules.map((modulo) => ({ ...modulo, grupo: grupo.label })))
  const porId = new Map(modulosVisibles.map((modulo) => [modulo.id, modulo]))
  const favoritosVisibles = favoritos
    .map((id) => porId.get(id))
    .filter((modulo): modulo is ModuloMenu => !!modulo)

  function renderModulo(modulo: ModuloMenu): React.JSX.Element {
    const Icon = modulo.icon
    const active = activeView === modulo.id
    const esFavorito = favoritos.includes(modulo.id)
    return (
      <li key={modulo.id} className="flex items-center gap-0.5">
        <button
          onClick={() => { setActiveView(modulo.id); setBusqueda('') }}
          title={titleSi(preferencias.tooltips && sidebarCollapsed, modulo.label)}
          aria-current={active ? 'page' : undefined}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
            active
              ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          } ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          {(interfaz.mostrarIconos || sidebarCollapsed) && <Icon size={17} className="shrink-0" />}
          {!sidebarCollapsed && <span className="truncate">{modulo.label}</span>}
          {sidebarCollapsed && !interfaz.mostrarIconos && <span className="sr-only">{modulo.label}</span>}
          {!sidebarCollapsed && !modulo.available && !ocultos.has('distintivoFase') && (
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title={titleSi(preferencias.tooltips, `Disponible en Fase ${modulo.phase}`)} />
          )}
        </button>
        {!sidebarCollapsed && (
          <button
            onClick={() => alternarFavorito(modulo.id)}
            className={`shrink-0 rounded p-1 ${esFavorito ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
            title={titleSi(preferencias.tooltips, esFavorito ? 'Quitar de favoritos' : 'Agregar a favoritos')}
            aria-label={`${esFavorito ? 'Quitar' : 'Agregar'} favorito: ${modulo.label}`}
          >
            <Star size={13} fill={esFavorito ? 'currentColor' : 'none'} />
          </button>
        )}
      </li>
    )
  }

  return (
    <aside
      style={{ width: sidebarCollapsed ? 64 : anchoSidebar }}
      className="flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Marca */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4 dark:border-slate-800">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Building2 size={17} />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold tracking-tight">{interfaz.tituloApp}</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-indigo-500">ERP</p>
          </div>
        )}
      </div>

      {/* Buscador global de módulos */}
      {!sidebarCollapsed && buscadorGlobal !== false && !ocultos.has('buscadorModulos') && (
        <div className="relative px-2 pt-2">
          <Search size={14} className="absolute left-5 top-4 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar módulos…"
            aria-label="Buscar módulos"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
      )}

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Módulos">
        {!sidebarCollapsed && !q && favoritosVisibles.length > 0 && (
          <section aria-label="Favoritos" className="mb-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Star size={12} fill="currentColor" /> Favoritos
              <span className="ml-auto normal-case tracking-normal">{favoritosVisibles.length}</span>
            </div>
            <ul className="space-y-0.5">
              {favoritosVisibles.map(renderModulo)}
            </ul>
          </section>
        )}

        {grupos.map((group) => {
          const abierto = !!q || !closedGroups[group.id] || group.modules.some((modulo) => modulo.id === activeView)
          return (
            <div key={group.id} className="mb-1.5">
              {!sidebarCollapsed && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  aria-expanded={abierto}
                >
                  <span>{group.label} <span className="ml-1 normal-case tracking-normal text-slate-300">({group.modules.length})</span></span>
                  <ChevronDown size={13} className={`transition-transform ${abierto ? '' : '-rotate-90'}`} />
                </button>
              )}
              {abierto && (
                <ul className="space-y-0.5">
                  {group.modules.map((modulo) => renderModulo({
                    ...modulo,
                    grupo: group.label
                  }))}
                </ul>
              )}
            </div>
          )
        })}
        {grupos.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">Sin módulos para «{busqueda}».</p>
        )}
      </nav>

      {/* Contraer / expandir */}
      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          title={titleSi(preferencias.tooltips, 'Ctrl+B')}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!sidebarCollapsed && <span>Contraer menú</span>}
        </button>
      </div>
    </aside>
  )
}

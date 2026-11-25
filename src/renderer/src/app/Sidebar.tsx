import { useState } from 'react'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Building2, Search } from 'lucide-react'
import { moduleGroups, modulePermission } from '@/app/modules'
import { useAppStore } from '@/app/store'
import { useSessionStore } from '@/app/session'
import { useAjustesStore } from '@/app/ajustes-store'

export function Sidebar(): React.JSX.Element {
  const { sidebarCollapsed, setSidebarCollapsed, activeView, setActiveView } = useAppStore()
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({})
  const [busqueda, setBusqueda] = useState('')
  const moduloActivo = useAjustesStore((s) => s.moduloActivo)
  const buscadorGlobal = useAjustesStore((s) => s.ajustes.widgets?.buscadorGlobal)
  // Suscribirse a los permisos mantiene el menú alineado tras editar roles.
  const permisos = useSessionStore((s) => s.ctx?.permisos ?? [])

  const toggleGroup = (id: string): void =>
    setClosedGroups((s) => ({ ...s, [id]: !s[id] }))

  const q = busqueda.trim().toLowerCase()
  const grupos = moduleGroups.map((grupo) => ({
    ...grupo,
    modules: grupo.modules.filter((modulo) => {
      const permiso = modulePermission(modulo.id)
      if (permiso && !permisos.includes(permiso)) return false
      if (!moduloActivo(modulo.id)) return false
      if (!q) return true
      return `${modulo.label} ${modulo.id} ${modulo.description} ${modulo.features.join(' ')} ${grupo.label}`
        .toLowerCase().includes(q)
    })
  })).filter((grupo) => grupo.modules.length > 0)

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Marca */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4 dark:border-slate-800">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Building2 size={17} />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold tracking-tight">ENTERPRISE PRO</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-indigo-500">ERP</p>
          </div>
        )}
      </div>

      {/* Buscador global de módulos */}
      {!sidebarCollapsed && buscadorGlobal !== false && (
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
        {grupos.map((group) => (
          <div key={group.id} className="mb-1.5">
            {!sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-expanded={q ? true : !closedGroups[group.id]}
              >
                {group.label}
                <ChevronDown
                  size={13}
                  className={`transition-transform ${!q && closedGroups[group.id] ? '-rotate-90' : ''}`}
                />
              </button>
            )}
            {(sidebarCollapsed || q || !closedGroups[group.id]) && (
              <ul className="space-y-0.5">
                {group.modules.map((m) => {
                  const Icon = m.icon
                  const active = activeView === m.id
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => { setActiveView(m.id); setBusqueda('') }}
                        title={sidebarCollapsed ? m.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        } ${sidebarCollapsed ? 'justify-center' : ''}`}
                      >
                        <Icon size={17} className="shrink-0" />
                        {!sidebarCollapsed && <span className="truncate">{m.label}</span>}
                        {!sidebarCollapsed && !m.available && (
                          <span
                            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                            title={`Disponible en Fase ${m.phase}`}
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
        {grupos.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">Sin módulos para «{busqueda}».</p>
        )}
      </nav>

      {/* Contraer / expandir */}
      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          title="Ctrl+B"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!sidebarCollapsed && <span>Contraer menú</span>}
        </button>
      </div>
    </aside>
  )
}

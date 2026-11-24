import { useState } from 'react'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Building2 } from 'lucide-react'
import { moduleGroups, modulePermission } from '@/app/modules'
import { useAppStore } from '@/app/store'
import { can } from '@/app/session'

export function Sidebar(): React.JSX.Element {
  const { sidebarCollapsed, setSidebarCollapsed, activeView, setActiveView } = useAppStore()
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (id: string): void =>
    setClosedGroups((s) => ({ ...s, [id]: !s[id] }))

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

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Módulos">
        {moduleGroups.map((group) => (
          <div key={group.id} className="mb-1.5">
            {!sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-expanded={!closedGroups[group.id]}
              >
                {group.label}
                <ChevronDown
                  size={13}
                  className={`transition-transform ${closedGroups[group.id] ? '-rotate-90' : ''}`}
                />
              </button>
            )}
            {(sidebarCollapsed || !closedGroups[group.id]) && (
              <ul className="space-y-0.5">
                {group.modules.map((m) => {
                  const permission = modulePermission(m.id)
                  if (permission && !can(permission)) return null
                  const Icon = m.icon
                  const active = activeView === m.id
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => setActiveView(m.id)}
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

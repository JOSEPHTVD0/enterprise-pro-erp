import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}): React.JSX.Element {
  const base = useId()
  const botones = useRef<Record<string, HTMLButtonElement | null>>({})

  function alPulsar(evento: KeyboardEvent<HTMLButtonElement>, indice: number): void {
    let destino = indice
    if (evento.key === 'ArrowRight') destino = (indice + 1) % tabs.length
    else if (evento.key === 'ArrowLeft') destino = (indice - 1 + tabs.length) % tabs.length
    else if (evento.key === 'Home') destino = 0
    else if (evento.key === 'End') destino = tabs.length - 1
    else return
    evento.preventDefault()
    const id = tabs[destino].id
    onChange(id)
    botones.current[id]?.focus()
  }

  return (
    <div
      role="group"
      aria-label="Secciones de esta vista"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
    >
      {tabs.map((t, indice) => {
        const seleccionada = active === t.id
        return (
          <button
            key={t.id}
            ref={(elemento) => { botones.current[t.id] = elemento }}
            type="button"
            id={`${base}-tab-${t.id}`}
            aria-pressed={seleccionada}
            tabIndex={seleccionada ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(evento) => alPulsar(evento, indice)}
            className={`erp-focus whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              seleccionada
                ? 'border-indigo-500 font-medium text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  children,
  tabId,
  className = ''
}: {
  children: ReactNode
  /** Id de la pestaña que controla este panel; opcional para callers heredados. */
  tabId?: string
  className?: string
}): React.JSX.Element {
  const base = useId()
  const id = tabId ? `${base}-panel-${tabId}` : undefined
  return (
    <div
      role="region"
      aria-label="Contenido de la sección"
      id={id}
      tabIndex={0}
      className={`animate-fade-in ${className}`}
    >
      {children}
    </div>
  )
}

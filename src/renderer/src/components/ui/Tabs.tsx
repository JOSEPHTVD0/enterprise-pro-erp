import type { ReactNode } from 'react'

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
            active === t.id
              ? 'border-indigo-500 font-medium text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="animate-fade-in">{children}</div>
}

import { AlertTriangle, Inbox, SearchX, ShieldAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const tonos = {
  empty: { icono: Inbox, clase: 'text-slate-400 dark:text-slate-500' },
  filtered: { icono: SearchX, clase: 'text-slate-400 dark:text-slate-500' },
  permission: { icono: ShieldAlert, clase: 'text-amber-500 dark:text-amber-400' },
  error: { icono: AlertTriangle, clase: 'text-rose-500 dark:text-rose-400' }
} as const

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'empty',
  className = ''
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  tone?: keyof typeof tonos
  className?: string
}): React.JSX.Element {
  const Icono = icon ?? tonos[tone].icono
  return (
    <div role="status" className={`erp-empty ${className}`}>
      <Icono size={28} strokeWidth={1.5} aria-hidden="true" className={tonos[tone].clase} />
      <p className="font-medium text-slate-600 dark:text-slate-200">{title}</p>
      {description && <p className="max-w-md text-xs">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="erp-focus erp-interactive mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function EmptyStateSlot({ children }: { children?: ReactNode }): React.JSX.Element {
  return <div className="flex min-h-[8rem] items-center justify-center">{children}</div>
}

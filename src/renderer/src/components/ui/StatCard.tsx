import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from './Skeleton'

const tonos = {
  neutral: 'text-slate-800 dark:text-slate-100',
  accent: 'text-indigo-600 dark:text-indigo-300',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
  info: 'text-sky-600 dark:text-sky-400'
} as const

export function StatCard({
  label,
  value,
  hint,
  icon: Icono,
  tone = 'neutral',
  dense = false,
  loading = false
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: keyof typeof tonos
  dense?: boolean
  loading?: boolean
}): React.JSX.Element {
  return (
    <div className={`erp-card erp-interactive rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${dense ? 'p-2.5' : 'p-3.5'}`}>
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {Icono && <Icono size={13} aria-hidden="true" />}
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-3 h-6 w-1/2" />
      ) : (
        <p className={`erp-tabular mt-1 text-lg font-semibold ${tonos[tone]}`}>{value}</p>
      )}
      {hint && <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  )
}

import type { ReactNode } from 'react'

/** Bloques de carga con la misma forma que el contenido que sustituyen. */

export function Skeleton({
  className = '', children
}: { className?: string; children?: ReactNode }): React.JSX.Element {
  return <div aria-hidden="true" className={`erp-skeleton ${className}`}>{children}</div>
}

export function SkeletonKpis({ count = 4 }: { count?: number }): React.JSX.Element {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-3 h-6 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }): React.JSX.Element {
  return (
    <div aria-hidden="true" className="w-full space-y-2 p-3">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ className = 'h-56' }: { className?: string }): React.JSX.Element {
  return (
    <div aria-hidden="true" className={`flex ${className} w-full items-end gap-2 px-3 pb-3`}>
      {[38, 62, 45, 78, 54, 88, 67, 95, 72, 83].map((alto, i) => (
        <div key={i} className="flex-1" style={{ height: `${alto}%` }}>
          <Skeleton className="h-full w-full" />
        </div>
      ))}
    </div>
  )
}

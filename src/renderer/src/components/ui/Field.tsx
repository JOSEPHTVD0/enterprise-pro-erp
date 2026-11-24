import type { InputHTMLAttributes, ReactNode } from 'react'

export const inputClass =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800'

export function Field({
  label,
  children,
  hint,
  className = ''
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

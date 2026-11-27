import { LoaderCircle } from 'lucide-react'

/** Estado de carga accesible. El texto siempre está presente aunque se desactiven animaciones. */
export function LoadingState({
  label = 'Cargando…',
  inline = false,
  className = ''
}: {
  label?: string
  inline?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-slate-500 dark:text-slate-400 ${
        inline ? 'justify-center text-xs' : 'h-full justify-center text-sm'
      } ${className}`}
    >
      <LoaderCircle size={inline ? 14 : 18} className="animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

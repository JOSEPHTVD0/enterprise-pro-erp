import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title: string
  subtitle?: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}

const NOOP = (): void => {}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Modal profesional: portal, cierre con Escape, foco inicial, trampa de foco y foco restaurado. */
export function Modal({
  open,
  title,
  subtitle,
  onClose = NOOP,
  children,
  footer,
  width = 'max-w-lg'
}: ModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const anteriorRef = useRef<HTMLElement | null>(null)
  const tituloId = useId()
  const subtituloId = useId()
  // `onClose` suele ser una flecha inline que cambia en cada render del padre.
  // Guardarlo en un ref evita que el efecto se vuelva a ejecutar (y robe el foco
  // del campo que se está escribiendo) cuando el modal cambia de estado interno.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    anteriorRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      const focoseables = panel ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)] : []
      if (focoseables.length === 0) {
        e.preventDefault()
        panel?.focus()
        return
      }
      const primero = focoseables[0]
      const ultimo = focoseables[focoseables.length - 1]
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const panel = panelRef.current
    const campo = panel?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select')
    ;(campo ?? panel)?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      const anterior = anteriorRef.current
      if (anterior?.isConnected) anterior.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={subtitle ? subtituloId : undefined}
        className={`animate-fade-in w-full ${width} rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 id={tituloId} className="text-sm font-semibold">{title}</h2>
            {subtitle && <p id={subtituloId} className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="erp-focus rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  )
}

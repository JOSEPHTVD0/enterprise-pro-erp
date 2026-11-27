import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { preferenciasActuales } from '@/lib/format'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
type EventoNotificacion =
  | 'VENTA' | 'COMPRA' | 'STOCK_BAJO' | 'CXC_VENCIDO' | 'SERIE_ALERTA' | 'BACKUP' | 'ACTUALIZACION'

interface OpcionesToast {
  evento?: EventoNotificacion
  firma?: string
}

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (kind: ToastKind, message: string, opciones?: OpcionesToast) => void
  dismiss: (id: number) => void
}

let nextId = 1
const firmasEmitidas = new Set<string>()

/** Pitido breve; si el navegador bloquea el audio, la notificación sigue visible. */
function sonar(): void {
  try {
    const conWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
    const Contexto = window.AudioContext ?? conWindow.webkitAudioContext
    if (!Contexto) return
    const contexto = new Contexto()
    const oscilador = contexto.createOscillator()
    const volumen = contexto.createGain()
    oscilador.type = 'sine'
    oscilador.frequency.value = 880
    volumen.gain.setValueAtTime(0.03, contexto.currentTime)
    volumen.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.12)
    oscilador.connect(volumen).connect(contexto.destination)
    oscilador.start()
    oscilador.stop(contexto.currentTime + 0.12)
    oscilador.onended = () => { void contexto.close() }
  } catch {
    // Audio es una preferencia accesoria: nunca interrumpe la interfaz.
  }
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, opciones = {}) => {
    if (opciones.firma) {
      if (firmasEmitidas.has(opciones.firma)) return
      firmasEmitidas.add(opciones.firma)
    }
    const id = nextId++
    const duracion = preferenciasActuales().notificaciones.duracionToastMs
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    if (preferenciasActuales().notificaciones.sonido) sonar()
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, duracion)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
  warning: (message: string) => useToastStore.getState().push('warning', message),
  info: (message: string) => useToastStore.getState().push('info', message),
  /**
   * Advertencias generadas localmente: respetan `notificaciones.eventos`,
   * `notificaciones.duracionToastMs`, `sonido` y `alertas.destinos`.
   */
  evento: (evento: EventoNotificacion, message: string, firma?: string): void => {
    const preferencias = preferenciasActuales()
    if (!preferencias.notificaciones.eventos.includes(evento)) return
    if (!preferencias.alertas.destinos.includes('TOAST')) return
    useToastStore.getState().push('warning', message, { evento, firma })
  }
}

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

const styles: Record<ToastKind, string> = {
  success: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  error: 'border-red-500/40 text-red-700 dark:text-red-300',
  warning: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  info: 'border-sky-500/40 text-sky-700 dark:text-sky-300'
}

export function Toaster(): React.JSX.Element {
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="pointer-events-none fixed right-4 top-14 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' || t.kind === 'warning' ? 'alert' : 'status'}
            aria-live={t.kind === 'error' || t.kind === 'warning' ? 'assertive' : 'polite'}
            className={`animate-toast-in pointer-events-auto flex items-start gap-2 rounded-lg border bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur dark:bg-slate-900/95 ${styles[t.kind]}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Cerrar notificación"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

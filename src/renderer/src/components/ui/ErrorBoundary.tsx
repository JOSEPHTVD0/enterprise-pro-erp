import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  compact?: boolean
}

interface State {
  error: Error | null
}

/**
 * Evita que una excepción de render deje `#root` vacío sobre el fondo oscuro
 * de la ventana. Muestra siempre una recuperación visible y accionable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] Error de interfaz:', error, info.componentStack)
  }

  private async recargar(): Promise<void> {
    try {
      // El proceso principal recarga el WebContents; evita que `will-navigate`
      // cancele una recarga iniciada desde el renderer.
      await window.api.invoke('app:reload')
    } catch {
      window.location.reload()
    }
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.compact) {
      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-6 text-center"
          style={{ background: '#fffbeb', color: '#78350f' }}
        >
          <p className="text-sm font-semibold">Esta vista no se pudo mostrar</p>
          <p className="max-w-md text-xs">{error.message}</p>
          <button
            type="button"
            onClick={() => void this.recargar()}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Recargar interfaz
          </button>
        </div>
      )
    }

    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
        style={{ background: '#f8fafc', color: '#0f172a' }}
      >
        <h1 className="text-lg font-semibold">La interfaz encontró un error</h1>
        <p className="max-w-md text-sm text-slate-600">{error.message}</p>
        <button
          type="button"
          onClick={() => void this.recargar()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          Recargar interfaz
        </button>
      </div>
    )
  }
}

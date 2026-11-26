import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FolderOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import type { EstadoActualizacion, ProgresoDescarga } from '@shared/actualizaciones'
import {
  verificarActualizaciones, descargarActualizacion, abrirCarpetaInstalador,
  suscribirProgresoDescarga
} from '@/lib/actualizaciones'

/**
 * Controles de actualización reutilizables. El estado vive en el componente que lo
 * consume (Topbar) para que el distintivo y todos los paneles muestren lo mismo.
 * La descarga guarda el instalador en Descargas; la instalación es manual.
 */
export function UpdateControls({
  update,
  onUpdate
}: {
  update: EstadoActualizacion | null
  onUpdate: (estado: EstadoActualizacion) => void
}): React.JSX.Element {
  const [buscando, setBuscando] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoDescarga | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  useEffect(() => suscribirProgresoDescarga(setProgreso), [])
  useEffect(() => {
    if (update?.descargada) setProgreso(null)
  }, [update?.descargada])

  async function verificar(): Promise<void> {
    setBuscando(true)
    setErrorDescarga(null)
    try {
      const resultado = await verificarActualizaciones()
      onUpdate(resultado)
      if (resultado.error) toast.error(resultado.error)
      else if (resultado.disponible) toast.success(`Versión ${resultado.version} disponible.`)
      else toast.success('Está utilizando la última versión.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo buscar actualizaciones.')
    } finally {
      setBuscando(false)
    }
  }

  async function descargar(): Promise<void> {
    setDescargando(true)
    setErrorDescarga(null)
    setProgreso({ porcentaje: 0, transferido: 0, total: 0 })
    try {
      const resultado = await descargarActualizacion()
      onUpdate(resultado)
      if (resultado.error) throw new Error(resultado.error)
      setProgreso(null)
      toast.success('Instalador guardado. Ejecútelo manualmente desde la carpeta Descargas.')
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo descargar el instalador.'
      setErrorDescarga(mensaje)
      toast.error(mensaje)
      setProgreso(null)
    } finally {
      setDescargando(false)
    }
  }

  async function abrirCarpeta(): Promise<void> {
    try {
      await abrirCarpetaInstalador()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la carpeta Descargas.')
    }
  }

  if (descargando || progreso) {
    const porcentaje = progreso?.porcentaje ?? 0
    const total = progreso?.total ?? 0
    const transferido = progreso?.transferido ?? 0
    const megas = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1)

    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/20" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
            <Download size={20} className="animate-bounce" />
          </div>
          <div>
            <p className="text-sm font-semibold">Descargando instalador…</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Versión {update?.version ?? 'nueva'} · se guardará en Descargas
            </p>
          </div>
          <div className="w-full">
            <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{porcentaje}%</span>
              <span>
                {total > 0
                  ? `${megas(transferido)} / ${megas(total)} MB`
                  : 'Preparando descarga…'}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            {!!progreso?.velocidad && (
              <p className="mt-1 text-[11px] text-slate-400">{megas(progreso.velocidad)} MB/s</p>
            )}
          </div>
          {errorDescarga && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorDescarga}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Actualizaciones</p>
          <p className="text-xs text-slate-400">
            {update?.habilitada
              ? `Feed configurado · versión actual ${update.versionActual}`
              : 'Fuente de actualizaciones no disponible'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void verificar()} disabled={buscando || !update?.habilitada}>
          <RefreshCw size={14} className={buscando ? 'animate-spin' : ''} /> {buscando ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {update?.verificado && !update.disponible && !update.error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 size={16} className="shrink-0" />
          Está utilizando la última versión ({update.versionActual}).
        </div>
      )}

      {update?.disponible && !update.descargada && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs">
            Versión <strong>{update.version}</strong> disponible.
            {update.notas && <span className="mt-1 block text-slate-400">{update.notas}</span>}
          </p>
          <Button size="sm" onClick={() => void descargar()} disabled={descargando}>
            <Download size={14} /> Descargar instalador
          </Button>
        </div>
      )}

      {update?.descargada && (
        <div className="mt-3 flex items-start justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Instalador guardado en Descargas.
            </p>
            {update.rutaInstalador && (
              <p className="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400">
                {update.rutaInstalador}
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              Ejecute el archivo para instalar. Si aparece SmartScreen, elija «Más información» y «Ejecutar de todos modos».
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void abrirCarpeta()}>
            <FolderOpen size={14} /> Abrir carpeta
          </Button>
        </div>
      )}

      {(update?.error || errorDescarga) && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {errorDescarga ?? update?.error}
        </p>
      )}
    </div>
  )
}

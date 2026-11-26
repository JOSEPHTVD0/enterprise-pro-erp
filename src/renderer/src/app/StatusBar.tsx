import { useEffect, useState } from 'react'
import { Clock3, HardDrive, WifiOff } from 'lucide-react'
import type { AppInfo } from '@shared/app-info'
import { useAjustesStore } from '@/app/ajustes-store'
import { useSessionStore } from '@/app/session'
import { titleSi, usePreferenciasInterfaz } from '@/lib/format'

export function StatusBar(): React.JSX.Element | null {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const ocultarElementos = useAjustesStore((s) => s.ajustes.interfaz?.ocultarElementos) ?? []
  const ocultos = new Set(ocultarElementos)
  const pie = useAjustesStore((s) => s.ajustes.interfaz?.piePersonalizado ?? '')
  const ctx = useSessionStore((s) => s.ctx)
  const preferencias = usePreferenciasInterfaz()
  const [now, setNow] = useState(Date.now())
  const [interaccion, setInteraccion] = useState(Date.now())

  useEffect(() => {
    window.api.app
      .getInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  useEffect(() => {
    const reloj = window.setInterval(() => setNow(Date.now()), 15_000)
    const actividad = (): void => setInteraccion(Date.now())
    window.addEventListener('pointerdown', actividad)
    window.addEventListener('keydown', actividad)
    return () => {
      window.clearInterval(reloj)
      window.removeEventListener('pointerdown', actividad)
      window.removeEventListener('keydown', actividad)
    }
  }, [])

  const inicio = ctx?.iniciaEn ? new Date(`${ctx.iniciaEn.replace(' ', 'T')}Z`).getTime() : NaN
  const restanteAbsoluto = Number.isFinite(inicio) ? 12 * 60 * 60_000 - (now - inicio) : NaN
  const restanteInactividad = 30 * 60_000 - (now - interaccion)
  const restante = Number.isFinite(restanteAbsoluto)
    ? Math.max(0, Math.min(restanteInactividad, restanteAbsoluto))
    : Math.max(0, restanteInactividad)
  const minutos = Math.ceil(restante / 60_000)
  // Solo cambia el aviso visual; el cierre real sigue en 30 min / 12 h en backend.
  const aviso = restante < preferencias.avisoBloqueoMin * 60_000

  if (ocultos.has('barraEstado')) return null

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-white px-4 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-900">
      <span className="flex items-center gap-1">
        <WifiOff size={12} /> Modo local · sin Internet
      </span>
      {info && (
        <span className="flex min-w-0 items-center gap-1">
          <HardDrive size={12} />
          <span className="truncate">{info.userDataPath}</span>
        </span>
      )}
      {pie && <span className="truncate">{pie}</span>}
      {ctx && (
        <span
          data-aviso-min={preferencias.avisoBloqueoMin}
          className={`flex items-center gap-1 ${aviso ? 'text-amber-600 dark:text-amber-400' : ''}`}
          title={titleSi(preferencias.tooltips,
            `La sesión se cierra a los 30 minutos de inactividad o 12 horas después del inicio. Aviso visual a los ${preferencias.avisoBloqueoMin} minutos.`
          )}
        >
          <Clock3 size={12} /> Sesión ≈ {minutos} min
          <span className="text-[10px] opacity-70">Aviso {preferencias.avisoBloqueoMin} min</span>
        </span>
      )}
      <span className="ml-auto">{info ? `v${info.version}` : ''}</span>
    </footer>
  )
}

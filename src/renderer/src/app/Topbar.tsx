import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor, Info, UserRound, LogOut, KeyRound, ShieldCheck, RefreshCw, Download, Power } from 'lucide-react'
import { useAppStore } from '@/app/store'
import { useSessionStore, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import type { AppInfo } from '@shared/app-info'
import type { EstadoActualizacion } from '@shared/actualizaciones'
import {
  estadoActualizaciones, verificarActualizaciones, descargarActualizacion, instalarActualizacion
} from '@/lib/actualizaciones'

const themeCycle = { light: 'dark', dark: 'system', system: 'light' } as const
const themeIcon = { light: Sun, dark: Moon, system: Monitor } as const
const themeLabel = { light: 'Tema claro', dark: 'Tema oscuro', system: 'Tema del sistema' } as const

export function Topbar({ onChangePassword }: { onChangePassword: () => void }): React.JSX.Element {
  const { theme, setTheme } = useAppStore()
  const { ctx, logout } = useSessionStore()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<EstadoActualizacion | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const ThemeIcon = themeIcon[theme]

  useEffect(() => {
    if (!aboutOpen) return
    if (!info) {
      window.api.app
        .getInfo()
        .then(setInfo)
        .catch(() => setInfo(null))
    }
    if (!update) {
      void estadoActualizaciones().then(setUpdate).catch(() => setUpdate(null))
    }
  }, [aboutOpen, info, update])

  async function verificar(): Promise<void> {
    setBuscando(true)
    try {
      const resultado = await verificarActualizaciones()
      setUpdate(resultado)
      if (resultado.error) toast.error(resultado.error)
      else if (!resultado.disponible) toast.info('No hay actualizaciones disponibles.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setBuscando(false)
    }
  }

  async function descargar(): Promise<void> {
    setDescargando(true)
    try {
      const resultado = await descargarActualizacion()
      setUpdate(resultado)
      if (resultado.error) toast.error(resultado.error)
      else toast.success('Actualización descargada. Ya puede instalarla.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setDescargando(false)
    }
  }

  function instalar(): void {
    try {
      instalarActualizacion()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{ctx?.empresaNombre ?? 'Empresa sin configurar'}</p>
        <p className="text-[11px] text-slate-400">
          Base de datos local · permisos verificados en el servidor
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Badge tone="accent">Fase 10 · Auditoría y respaldos</Badge>

        <div className="relative">
          <button
            onClick={() => setUserMenu(!userMenu)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-expanded={userMenu}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <UserRound size={15} />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-medium">{ctx?.nombre || ctx?.username}</span>
              <span className="block text-slate-400">@{ctx?.username}</span>
            </span>
          </button>
          {userMenu && (
            <div className="absolute right-0 top-10 z-30 w-60 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-2 py-2 text-xs dark:border-slate-800">
                <p className="flex items-center gap-1.5 font-medium"><ShieldCheck size={13} className="text-indigo-500" /> Sesión activa</p>
                <p className="mt-1 text-slate-400">{ctx?.permisos.length ?? 0} permisos efectivos</p>
              </div>
              <button
                onClick={() => { setUserMenu(false); onChangePassword() }}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <KeyRound size={15} /> Cambiar contraseña
              </button>
              <button
                onClick={() => { setUserMenu(false); void logout() }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut size={15} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setTheme(themeCycle[theme])}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          title={`${themeLabel[theme]} — clic para cambiar`}
          aria-label={themeLabel[theme]}
        >
          <ThemeIcon size={17} />
        </button>
        <button
          onClick={() => setAboutOpen(true)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          title="Acerca de"
          aria-label="Acerca de"
        >
          <Info size={17} />
        </button>
      </div>

      <Modal
        open={aboutOpen}
        title="Acerca de ENTERPRISE PRO ERP"
        onClose={() => setAboutOpen(false)}
        footer={<Button onClick={() => setAboutOpen(false)}>Cerrar</Button>}
      >
        {info ? (
          <dl className="space-y-2 text-sm">
            {(
              [
                ['Aplicación', info.name],
                ['Versión', info.version],
                ['Electron', info.electron],
                ['Node.js', info.node],
                ['Plataforma', info.platform],
                ['Directorio de datos', info.userDataPath]
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="text-right font-medium break-all">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Cargando información…</p>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Actualizaciones</p>
              <p className="text-xs text-slate-400">
                {update?.habilitada
                  ? `Feed configurado · versión actual ${update.versionActual}`
                  : 'Fuente no configurada (ERP_UPDATE_URL)'}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void verificar()} disabled={buscando || !update?.habilitada}>
              <RefreshCw size={14} className={buscando ? 'animate-spin' : ''} /> Buscar
            </Button>
          </div>
          {update?.disponible && !update.descargada && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs">Versión <strong>{update.version}</strong> disponible.</p>
              <Button size="sm" onClick={() => void descargar()} disabled={descargando}>
                <Download size={14} /> {descargando ? 'Descargando…' : 'Descargar'}
              </Button>
            </div>
          )}
          {update?.descargada && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Lista para instalar ({update.archivos ?? 1} archivo(s)).</p>
              <Button size="sm" onClick={instalar}><Power size={14} /> Instalar y reiniciar</Button>
            </div>
          )}
          {update?.error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{update.error}</p>}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          ERP administrativo y comercial 100 % local. Adaptado a República Dominicana (DOP,
          RNC/cédula, ITBIS, NCF). No certificado por la DGII para e-CF.
        </p>
      </Modal>
    </header>
  )
}

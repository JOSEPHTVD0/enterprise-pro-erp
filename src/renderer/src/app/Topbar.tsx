import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor, Info, UserRound, LogOut, KeyRound, ShieldCheck, Download, Building2, Check } from 'lucide-react'
import { useAppStore } from '@/app/store'
import { useAjustesStore } from '@/app/ajustes-store'
import { moduleGroups } from '@/app/modules'
import { useSessionStore, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { UpdateControls } from '@/features/actualizaciones/UpdateControls'
import type { AppInfo } from '@shared/app-info'
import type { EstadoActualizacion } from '@shared/actualizaciones'
import { estadoActualizaciones, suscribirEstadoActualizacion } from '@/lib/actualizaciones'
import {
  aplicarPreferenciasGlobal, instalarObservadorPreferencias, preferenciasActuales,
  recargarPreferencias, titleSi, usePreferenciasInterfaz
} from '@/lib/format'
import { useTexto } from '@/lib/i18n'

const themeCycle = { light: 'dark', dark: 'system', system: 'light' } as const
const themeIcon = { light: Sun, dark: Moon, system: Monitor } as const
const themeLabel = { light: 'Tema claro', dark: 'Tema oscuro', system: 'Tema del sistema' } as const
const faseActual = Math.max(...moduleGroups.flatMap((g) => g.modules.map((m) => m.phase)))

export function Topbar({ onChangePassword }: { onChangePassword: () => void }): React.JSX.Element {
  const { theme, setTheme } = useAppStore()
  const { ctx, companies, logout, switchCompany } = useSessionStore()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const ocultarElementos = useAjustesStore((s) => s.ajustes.interfaz?.ocultarElementos) ?? []
  const ocultos = new Set(ocultarElementos)
  const [update, setUpdate] = useState<EstadoActualizacion | null>(null)
  const ThemeIcon = themeIcon[theme]
  const preferencias = usePreferenciasInterfaz()
  const t = useTexto()

  // Única fuente de verdad del acento, tamaño y densidad resueltos.
  useEffect(() => {
    aplicarPreferenciasGlobal(preferenciasActuales())
  }, [
    preferencias.acento, preferencias.tamanoFuente, preferencias.densidad,
    preferencias.reducirMovimiento, preferencias.tooltips, preferencias.confirmarAcciones,
    preferencias.modoBajoConsumo
  ])

  useEffect(() => instalarObservadorPreferencias(), [])

  useEffect(() => {
    const onActualizar = (): void => { void recargarPreferencias() }
    window.addEventListener('erp:preferencias-actualizadas', onActualizar)
    return () => window.removeEventListener('erp:preferencias-actualizadas', onActualizar)
  }, [])

  // El proceso principal ya consulta el feed al iniciar cuando la app está instalada;
  // aquí solo leemos el estado para mostrar el distintivo sin lanzar red extra.
  useEffect(() => {
    const leer = (): void => {
      void estadoActualizaciones().then(setUpdate).catch(() => setUpdate(null))
    }
    leer()
    const cancelar = suscribirEstadoActualizacion(setUpdate)
    const temporizador = window.setInterval(leer, 60_000)
    return () => {
      window.clearInterval(temporizador)
      cancelar()
    }
  }, [])

  useEffect(() => {
    if (!aboutOpen || info) return
    window.api.app
      .getInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [aboutOpen, info])

  async function cambiarEmpresa(empresaId: number): Promise<void> {
    setUserMenu(false)
    if (empresaId === ctx?.empresaId) return
    try {
      await switchCompany(empresaId)
      await useAjustesStore.getState().cargar()
      useAppStore.getState().setActiveView('dashboard')
      toast.success('Empresa activa cambiada.')
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
        {!ocultos.has('distintivoFase') && <Badge tone="accent">Módulos hasta la fase {faseActual}</Badge>}

        <div className="relative">
          <button
            onClick={() => setUserMenu(!userMenu)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-expanded={userMenu}
          >
            {!ocultos.has('avatarUsuario') && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                <UserRound size={15} />
              </span>
            )}
            <span className="hidden leading-tight sm:block">
              <span className="block font-medium">{ctx?.nombre || ctx?.username}</span>
              <span className="block text-slate-400">@{ctx?.username}</span>
            </span>
          </button>
          {userMenu && (
            <div className="absolute right-0 top-10 z-30 w-60 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-2 py-2 text-xs dark:border-slate-800">
                <p className="flex items-center gap-1.5 font-medium"><ShieldCheck size={13} className="text-indigo-500" /> {t('sesionActiva')}</p>
                <p className="mt-1 text-slate-400">{ctx?.permisos.length ?? 0} permisos efectivos</p>
              </div>
              {companies.length > 1 && (
                <div className="border-b border-slate-100 py-1 dark:border-slate-800">
                  <p className="px-2 py-1 text-[11px] uppercase text-slate-400">Cambiar empresa</p>
                  {companies.map((empresa) => (
                    <button
                      key={empresa.id}
                      onClick={() => void cambiarEmpresa(empresa.id)}
                      disabled={empresa.id === ctx?.empresaId}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 disabled:bg-indigo-50 disabled:text-indigo-700 dark:hover:bg-slate-800 dark:disabled:bg-indigo-950/30 dark:disabled:text-indigo-300"
                    >
                      <Building2 size={14} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{empresa.nombre}</span>
                      {empresa.id === ctx?.empresaId && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setUserMenu(false); onChangePassword() }}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <KeyRound size={15} /> {t('cambiarContrasena')}
              </button>
              <button
                onClick={() => { setUserMenu(false); void logout() }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut size={15} /> {t('cerrarSesion')}
              </button>
            </div>
          )}
        </div>

        {!ocultos.has('botonTema') && (
          <button
            onClick={() => setTheme(themeCycle[theme])}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title={titleSi(preferencias.tooltips, `${themeLabel[theme]} — clic para cambiar`)}
            aria-label={themeLabel[theme]}
          >
            <ThemeIcon size={17} />
          </button>
        )}
        {!ocultos.has('botonActualizaciones') && (
          <button
            onClick={() => { setUserMenu(false); setUpdatesOpen(true) }}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title={titleSi(preferencias.tooltips, t('actualizaciones'))}
            aria-label={t('actualizaciones')}
          >
            <Download size={17} />
            {(update?.disponible || update?.descargada) && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>
        )}
        {!ocultos.has('botonAcerca') && (
          <button
            onClick={() => setAboutOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title={titleSi(preferencias.tooltips, t('acercaDe'))}
            aria-label={t('acercaDe')}
          >
            <Info size={17} />
          </button>
        )}
      </div>

      <Modal
        open={updatesOpen}
        title="Actualizaciones de ENTERPRISE PRO ERP"
        onClose={() => setUpdatesOpen(false)}
        footer={<Button onClick={() => setUpdatesOpen(false)}>Cerrar</Button>}
      >
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          Busque y descargue el instalador en Descargas. Si está actualizado no habrá descargas disponibles; cuando haya una versión nueva, el programa solo guardará el instalador y la instalación será manual. Los datos locales se conservan.
        </p>
        <UpdateControls update={update} onUpdate={setUpdate} />
      </Modal>

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

        <div className="mt-4">
          <UpdateControls update={update} onUpdate={setUpdate} />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          ERP administrativo y comercial 100 % local. Adaptado a República Dominicana (DOP,
          RNC/cédula, ITBIS, NCF). No certificado por la DGII para e-CF.
        </p>
      </Modal>
    </header>
  )
}

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { defaultSettings, resolveTheme } from '@shared/settings'
import { useAppStore } from '@/app/store'
import { useAjustesStore } from '@/app/ajustes-store'
import { aplicarTemaAvanzado } from '@/lib/tema-avanzado'
import { findModule, modulePermission } from '@/app/modules'
import { Sidebar } from '@/app/Sidebar'
import { Topbar } from '@/app/Topbar'
import { StatusBar } from '@/app/StatusBar'
import { useSessionStore } from '@/app/session'
import { Toaster, toast } from '@/components/ui/Toast'
import { Card } from '@/components/ui/Card'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DashboardEjecutivoPage } from '@/features/dashboard/DashboardEjecutivoPage'
import { AparienciaPage } from '@/features/apariencia/AparienciaPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ChangePasswordModal } from '@/features/auth/ChangePasswordModal'
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import { RolesPage } from '@/features/usuarios/RolesPage'
import { ConfiguracionPage } from '@/features/configuracion/ConfiguracionPage'
import { ConfiguracionAvanzadaPage } from '@/features/configuracion/ConfiguracionAvanzadaPage'
import { CentroControlPage } from '@/features/configuracion/CentroControlPage'
import { InteligenciaOperativaPage } from '@/features/inteligencia/InteligenciaOperativaPage'
import { SaludPage } from '@/features/sistema/SaludPage'
import { Modulos2026Page } from '@/features/modulos2026/Modulos2026Page'
import { AuditoriaPage } from '@/features/auditoria/AuditoriaPage'
import { ClientesPage } from '@/features/maestros/ClientesPage'
import { ProveedoresPage } from '@/features/maestros/ProveedoresPage'
import { ProductosPage } from '@/features/maestros/ProductosPage'
import { CatalogosPage } from '@/features/maestros/CatalogosPage'
import { InventarioPage } from '@/features/inventario/InventarioPage'
import { FacturacionPage } from '@/features/ventas/FacturacionPage'
import { PosPage } from '@/features/ventas/PosPage'
import { CotizacionesPage } from '@/features/ventas/CotizacionesPage'
import { ComprasPage } from '@/features/compras/ComprasPage'
import { CxcPage } from '@/features/finanzas/CxcPage'
import { CxpPage } from '@/features/finanzas/CxpPage'
import { BancosPage } from '@/features/finanzas/BancosPage'
import { CajasPage } from '@/features/finanzas/CajasPage'
import { GastosPage } from '@/features/finanzas/GastosPage'
import { ReportesPage } from '@/features/reportes/ReportesPage'
import { ContabilidadPage } from '@/features/contabilidad/ContabilidadPage'
import { RespaldosPage } from '@/features/respaldos/RespaldosPage'

function useThemeEffect(): void {
  const theme = useAppStore((s) => s.theme)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const effective = resolveTheme(theme, systemDark)
    document.documentElement.classList.toggle('dark', effective === 'dark')
  }, [theme, systemDark])
}

function AccessDenied(): React.JSX.Element {
  return (
    <Card title="Acceso denegado" subtitle="Su perfil no tiene permiso para esta vista.">
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <ShieldAlert size={17} className="text-amber-500" />
        Solicite al administrador los permisos necesarios.
      </p>
    </Card>
  )
}

function ActiveView(): React.JSX.Element {
  const activeView = useAppStore((s) => s.activeView)
  const permiso = modulePermission(activeView)
  const ctx = useSessionStore((s) => s.ctx)
  const moduloActivo = useAjustesStore((s) => s.moduloActivo)
  if (permiso && !ctx?.permisos.includes(permiso)) return <AccessDenied />
  if (!moduloActivo(activeView)) return <AccessDenied />

  if (activeView === 'dashboard') return <DashboardPage />
  if (activeView === 'dashboard-ejecutivo') return <DashboardEjecutivoPage />
  if (activeView === 'apariencia') return <AparienciaPage />
  if (activeView === 'usuarios') return <UsuariosPage />
  if (activeView === 'roles') return <RolesPage />
  if (activeView === 'configuracion') return <ConfiguracionPage />
  if (activeView === 'configuracion-avanzada') return <ConfiguracionAvanzadaPage />
  if (activeView === 'centro-control') return <CentroControlPage />
  if (activeView === 'inteligencia') return <InteligenciaOperativaPage />
  if (activeView === 'salud') return <SaludPage />
  if (activeView === 'presupuestos' || activeView === 'servicios' || activeView === 'activos' || activeView === 'crm') {
    return <Modulos2026Page modulo={activeView} />
  }
  if (activeView === 'auditoria') return <AuditoriaPage />
  if (activeView === 'clientes') return <ClientesPage />
  if (activeView === 'proveedores') return <ProveedoresPage />
  if (activeView === 'productos') return <ProductosPage />
  if (activeView === 'catalogos' || activeView === 'vendedores') return <CatalogosPage />
  if (activeView === 'inventario') return <InventarioPage />
  if (activeView === 'facturacion') return <FacturacionPage />
  if (activeView === 'pos') return <PosPage />
  if (activeView === 'cotizaciones') return <CotizacionesPage />
  if (activeView === 'compras') return <ComprasPage />
  if (activeView === 'cxc') return <CxcPage />
  if (activeView === 'cxp') return <CxpPage />
  if (activeView === 'bancos') return <BancosPage />
  if (activeView === 'cajas') return <CajasPage />
  if (activeView === 'gastos') return <GastosPage />
  if (activeView === 'reportes') return <ReportesPage />
  if (activeView === 'contabilidad') return <ContabilidadPage />
  if (activeView === 'respaldos') return <RespaldosPage />
  const module = findModule(activeView)
  if (module) return <ModulePlaceholder module={module} />
  return <DashboardPage />
}

const NOOP = (): void => {}

export default function App(): React.JSX.Element {
  const { hydrated, hydrate, setSidebarCollapsed } = useAppStore()
  const activeView = useAppStore((s) => s.activeView)
  const { status, mustChangePassword, hydrate: hydrateSession, expire } = useSessionStore()
  const [passwordOpen, setPasswordOpen] = useState(false)
  useThemeEffect()

  // Preferencias persistidas (proceso principal → disco).
  useEffect(() => {
    window.api.settings
      .get()
      .then(hydrate)
      .catch(() => {
        hydrate(defaultSettings)
        toast.error('No se pudieron leer las preferencias; se usan valores por defecto.')
      })
  }, [hydrate])

  // Sesión en memoria del preload. Al reiniciar no hay token, por lo que se pide login.
  useEffect(() => {
    void hydrateSession()
  }, [hydrateSession])

  // Ajustes de la empresa: llegan con token, por lo que se cargan tras la sesión.
  const cargarAjustes = useAjustesStore((s) => s.cargar)
  const temaAvanzado = useAjustesStore((s) => s.ajustes.tema)
  useEffect(() => {
    if (status === 'authenticated') void cargarAjustes()
  }, [cargarAjustes, status])
  useEffect(() => {
    aplicarTemaAvanzado(temaAvanzado)
  }, [temaAvanzado])

  // Un 401 en cualquier operación cierra la sesión de forma global.
  useEffect(() => {
    const onUnauthorized = (): void => {
      // La sonda inicial `auth.me` sin token también produce UNAUTHORIZED;
      // en ese caso el usuario nunca inició sesión y no debe ver un aviso falso.
      const sesionActiva = useSessionStore.getState().status === 'authenticated'
      expire()
      if (sesionActiva) toast.warning('Su sesión ha expirado. Inicie sesión nuevamente.')
    }
    window.addEventListener('erp:unauthorized', onUnauthorized)
    return () => window.removeEventListener('erp:unauthorized', onUnauthorized)
  }, [expire])

  // Atajos globales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarCollapsed(!useAppStore.getState().sidebarCollapsed)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSidebarCollapsed])

  if (!hydrated || status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400">Cargando ENTERPRISE PRO ERP…</p>
      </div>
    )
  }

  if (status === 'guest') {
    return (
      <>
        <LoginPage />
        <Toaster />
      </>
    )
  }

  if (mustChangePassword) {
    return (
      <>
        <ChangePasswordModal open forced onDone={NOOP} />
        <Toaster />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onChangePassword={() => setPasswordOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto p-5" key={activeView}>
            <ActiveView />
          </main>
          <StatusBar />
        </div>
      </div>
      <ChangePasswordModal open={passwordOpen} forced={false} onDone={() => setPasswordOpen(false)} />
      <Toaster />
    </div>
  )
}

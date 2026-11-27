import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Circle, Database, Rocket } from 'lucide-react'
import { can } from '@/app/session'
import { useAppStore } from '@/app/store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonChart } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { allModules } from '@/app/modules'
import { money } from '@/lib/format'
import type { AppInfo } from '@shared/app-info'
import type { Indicadores, Serie } from '@/features/reportes/types'

const phases = [
  { n: 1, label: 'Análisis y arquitectura', done: true },
  { n: 2, label: 'Aplicación de escritorio', done: true },
  { n: 3, label: 'Seguridad y configuración', done: true },
  { n: 4, label: 'Maestros', done: true },
  { n: 5, label: 'Inventario', done: true },
  { n: 6, label: 'Ventas y POS', done: true },
  { n: 7, label: 'Compras', done: true },
  { n: 8, label: 'Finanzas', done: true },
  { n: 9, label: 'Reportes', done: true },
  { n: 10, label: 'Auditoría y respaldos', done: true },
  { n: 11, label: 'Pruebas integrales', done: true },
  { n: 12, label: 'Instalador Windows', done: true },
  { n: 13, label: 'Panel ejecutivo y módulos 2026', done: true }
]

interface Resumen {
  usuariosActivos: number
  empresasActivas: number
  roles: number
  impuestosActivos: number
  seriesActivas: number
  almacenes: number
  cajas: number
  sesionesActivas: number
  auditoriaHoy: number
  pendiente: string
}

export function DashboardPage(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [serie, setSerie] = useState<Serie | null>(null)
  const [salud, setSalud] = useState<{
    comprobaciones: { nombre: string; estado: string; detalle: string }[]
  } | null>(null)
  const available = allModules.filter((m) => m.available).length
  const conReportes = can('reportes.consultar')
  const conSalud = can('salud.consultar')

  useEffect(() => {
    window.api.app
      .getInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
    window.api.invoke<Resumen>('dashboard.resumen')
      .then(setResumen)
      .catch(() => setResumen(null))
  }, [])

  useEffect(() => {
    if (!conReportes) return
    Promise.all([
      window.api.invoke<Indicadores>('reportes.indicadores'),
      window.api.invoke<Serie>('reportes.serie', { granularidad: 'DIA' })
    ]).then(([ind, puntos]) => {
      setIndicadores(ind)
      setSerie(puntos)
    }).catch(() => {
      setIndicadores(null)
      setSerie(null)
    })
  }, [conReportes])

  useEffect(() => {
    if (!conSalud) return
    window.api.invoke<{
      comprobaciones: { nombre: string; estado: string; detalle: string }[]
    }>('salud.resumen')
      .then(setSalud)
      .catch(() => setSalud(null))
  }, [conSalud])

  const tareas = useMemo(() => {
    const items: { texto: string; vista: string; tono: 'warning' | 'danger' | 'accent' }[] = []
    if (indicadores && indicadores.productosAgotados > 0) {
      items.push({
        texto: `${indicadores.productosAgotados} producto(s) agotado(s): reponga existencias`,
        vista: 'inventario', tono: 'warning'
      })
    }
    if (indicadores && indicadores.cxcSaldoCent > 0 && can('cobros.consultar')) {
      items.push({
        texto: `CxC pendiente por ${money(indicadores.cxcSaldoCent)}: revise Cobros`,
        vista: 'cobros', tono: 'accent'
      })
    }
    for (const c of salud?.comprobaciones ?? []) {
      if (c.estado === 'error' || c.estado === 'advertencia') {
        items.push({ texto: `${c.nombre}: ${c.detalle}`, vista: 'salud', tono: c.estado === 'error' ? 'danger' : 'warning' })
      }
    }
    return items.slice(0, 8)
  }, [indicadores, salud])

  const tarjetas = useMemo(() => indicadores ? [
    { label: 'Ventas del día', valor: money(indicadores.ventasHoyCent) },
    { label: 'Ventas del mes', valor: money(indicadores.ventasMesCent) },
    { label: 'Cuentas por cobrar', valor: money(indicadores.cxcSaldoCent) },
    { label: 'Cuentas por pagar', valor: money(indicadores.cxpSaldoCent) },
    { label: 'Productos agotados', valor: String(indicadores.productosAgotados) },
    {
      label: 'Resumen de caja',
      valor: indicadores.cajaAbierta ? money(indicadores.cajaAbierta.fondoCent) : 'Sin sesión abierta'
    }
  ] : [], [indicadores])

  const puntosGrafica = useMemo(() => (serie?.puntos ?? []).map((punto) => ({
    clave: punto.clave,
    Ventas: punto.ventasCent / 100,
    Cobros: punto.cobrosCent / 100
  })), [serie])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inicio"
        subtitle="Panel principal alimentado por datos reales de SQLite."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm"
              onClick={() => useAppStore.getState().setActiveView('dashboard-ejecutivo')}>
              <BarChart3 size={14} /> Panel ejecutivo
            </Button>
            {conReportes && (
              <Button variant="secondary" size="sm"
                onClick={() => useAppStore.getState().setActiveView('reportes')}>
                <BarChart3 size={14} /> Abrir reportes
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(tarjetas.length > 0 ? tarjetas : [
          { label: 'Ventas del día', valor: '—' },
          { label: 'Ventas del mes', valor: '—' },
          { label: 'Cuentas por cobrar', valor: '—' },
          { label: 'Cuentas por pagar', valor: '—' },
          { label: 'Productos agotados', valor: '—' },
          { label: 'Resumen de caja', valor: '—' }
        ]).map((tarjeta) => (
          <StatCard
            key={tarjeta.label}
            label={tarjeta.label}
            value={tarjeta.valor}
            tone={tarjetas.length ? 'accent' : 'neutral'}
            loading={!indicadores}
            hint={!tarjetas.length ? (
              <span className="text-amber-600 dark:text-amber-400">
                {conReportes ? 'Sin datos en el período' : 'Sin permiso de reportes'}
              </span>
            ) : undefined}
          />
        ))}
      </div>

      {conReportes && (
        <Card title="Ventas y cobros" subtitle="Últimos 30 días · datos reales" className="mb-4">
          {!serie ? (
            <SkeletonChart className="h-[260px]" />
          ) : puntosGrafica.length > 0 ? (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={puntosGrafica} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="clave" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(valor, nombre) => [money(num(valor) * 100), String(nombre)]} />
                  <Legend />
                  <Area type="monotone" dataKey="Ventas" stroke="var(--erp-acento)" fill="var(--erp-acento)" fillOpacity={0.14} />
                  <Area type="monotone" dataKey="Cobros" stroke="#10b981" fill="#10b981" fillOpacity={0.12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              tone="empty"
              title="Sin movimientos en los últimos 30 días"
              description="La gráfica se llenará con ventas y cobros reales del período."
            />
          )}
        </Card>
      )}

      {resumen && (
        <Card
          title="Base de datos real"
          subtitle="Valores leídos de SQLite en este momento (datos reales)."
          className="mb-4"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[
              ['Usuarios activos', resumen.usuariosActivos],
              ['Empresas', resumen.empresasActivas],
              ['Roles', resumen.roles],
              ['Impuestos', resumen.impuestosActivos],
              ['Series', resumen.seriesActivas],
              ['Almacenes', resumen.almacenes],
              ['Cajas', resumen.cajas],
              ['Auditoría hoy', resumen.auditoriaHoy]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <Database size={13} /> {resumen.pendiente}
          </p>
        </Card>
      )}

      <Card
        title="Centro de tareas"
        subtitle="Pendientes detectados en datos reales; se actualizan al recargar el panel."
        className="mb-4"
      >
        {tareas.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={16} /> No hay tareas pendientes con la información disponible.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tareas.map((tarea, indice) => (
              <li key={`${tarea.vista}-${indice}`} className="flex items-center gap-3 py-2 text-sm">
                <AlertTriangle size={15} className={tarea.tono === 'danger'
                  ? 'shrink-0 text-red-500'
                  : tarea.tono === 'warning' ? 'shrink-0 text-amber-500' : 'shrink-0 text-indigo-500'} />
                <span className="min-w-0 flex-1">{tarea.texto}</span>
                <button
                  className="flex shrink-0 items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => useAppStore.getState().setActiveView(tarea.vista)}
                >
                  Abrir <ArrowRight size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Plan de desarrollo"
          subtitle="Fases aprobadas"
          className="lg:col-span-2"
        >
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {phases.map((p) => (
              <li key={p.n} className="flex items-center gap-2 text-sm">
                {p.done ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                ) : (
                  <Circle size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
                )}
                <span className={p.done ? '' : 'text-slate-500 dark:text-slate-400'}>
                  Fase {p.n} · {p.label}
                </span>
                {p.n === 13 && <Badge tone="accent">Actual</Badge>}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Estado del sistema">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Rocket size={16} className="text-indigo-500" />
              <span>
                {available} de {allModules.length} vistas activas
              </span>
            </div>
            {info && (
              <dl className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex justify-between">
                  <dt>Versión</dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-200">{info.version}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Electron</dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-200">{info.electron}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Node.js</dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-200">{info.node}</dd>
                </div>
              </dl>
            )}
            <p className="text-xs leading-relaxed text-slate-400">
              Los módulos pendientes se muestran con su alcance real. No hay datos de
              demostración ni operaciones simuladas.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function num(valor: unknown): number {
  const resultado = Number(valor)
  return Number.isFinite(resultado) ? resultado : 0
}

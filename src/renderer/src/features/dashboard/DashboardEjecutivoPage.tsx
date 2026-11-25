import { useCallback, useEffect, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { Download, RefreshCw, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { money, number } from '@/lib/format'
import { useAjustesStore } from '@/app/ajustes-store'
import { defaultAjustes, type WidgetId } from '@shared/schemas/ajustes'
import { toast } from '@/components/ui/Toast'

interface Kpis {
  ventasCent: number
  comprasCent: number
  facturas: number
  comprasDocumentos: number
  cobrosCent: number
  pagosCent: number
  cxcSaldoCent: number
  cxcDocumentos: number
  cxpSaldoCent: number
  cxpDocumentos: number
  utilidadCent: number | null
  margenBp: number | null
  clientesActivos: number
  productosActivos: number
  productosAgotados: number
  productosStockBajo: number
}

interface Datos {
  periodo: { desde: string; hasta: string; tipo: string }
  kpis: Kpis
  serieMensual: { clave: string; ventasCent: number; documentos: number }[]
  porFormaPago: { clave: string; montoCent: number }[]
  topProductos: { producto: string; totalCent: number; cantidad: number }[]
  topClientes: { cliente: string; totalCent: number; documentos: number }[]
  modulos: {
    presupuestosAprobados: number | null
    presupuestoDisponibleCent: number | null
    ordenesAbiertas: number | null
    leadsAbiertos: number | null
  }
  alertas: { nivel: string; texto: string }[]
}

const colores = ['#4f46e5', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6']

function descargarCsv(datos: Datos): void {
  const filas = [
    ['Indicador', 'Valor'],
    ['Desde', datos.periodo.desde], ['Hasta', datos.periodo.hasta],
    ['Ventas', money(datos.kpis.ventasCent)], ['Compras', money(datos.kpis.comprasCent)],
    ['Utilidad', datos.kpis.utilidadCent === null ? 'sin permiso' : money(datos.kpis.utilidadCent)],
    ['CxC', money(datos.kpis.cxcSaldoCent)], ['CxP', money(datos.kpis.cxpSaldoCent)],
    ...datos.topProductos.map((p) => [`Producto: ${p.producto}`, money(p.totalCent)]),
    ...datos.topClientes.map((c) => [`Cliente: ${c.cliente}`, money(c.totalCent)])
  ]
  const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `dashboard-ejecutivo-${datos.periodo.hasta}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Panel ejecutivo con cifras reales. Los importes del backend van en centavos. */
export function DashboardEjecutivoPage(): React.JSX.Element {
  const [periodo, setPeriodo] = useState('ANIO')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)
  const configuracion = useAjustesStore((s) => s.ajustes.widgets ?? defaultAjustes.widgets)
  const widget = useAjustesStore((s) => s.widget)
  const visible = (id: WidgetId): boolean => widget(id).visible
  const orden = (id: WidgetId): number => widget(id).orden
  const compacta = configuracion.densidad === 'compacta'

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      const resultado = await window.api.invoke<Datos>('dashboard.ejecutivo', {
        periodo,
        ...(periodo === 'PERSONALIZADO' && desde ? { fechaDesde: desde } : {}),
        ...(periodo === 'PERSONALIZADO' && hasta ? { fechaHasta: hasta } : {})
      })
      setDatos(resultado)
    } catch {
      setDatos(null)
      toast.error('No se pudo cargar el panel ejecutivo.')
    } finally {
      setCargando(false)
    }
  }, [periodo, desde, hasta])

  useEffect(() => { void cargar() }, [cargar])

  // Refresco automático configurado en el centro de control (mínimo 30 s en backend).
  useEffect(() => {
    const id = window.setInterval(() => void cargar(), configuracion.intervaloActualizacionSeg * 1000)
    return () => window.clearInterval(id)
  }, [cargar, configuracion.intervaloActualizacionSeg])

  const kpis = datos?.kpis
  const tarjetas = kpis ? ([
    { id: 'kpi-ventas' as const, label: 'Ventas del período', valor: money(kpis.ventasCent), tono: 'accent' as const },
    { id: 'kpi-compras' as const, label: 'Compras', valor: money(kpis.comprasCent), tono: 'neutral' as const },
    { id: 'kpi-utilidad' as const, label: 'Utilidad bruta', valor: kpis.utilidadCent === null ? 'Sin permiso' : money(kpis.utilidadCent), tono: 'success' as const },
    { id: 'kpi-margen' as const, label: 'Margen', valor: kpis.margenBp === null ? '—' : `${(kpis.margenBp / 100).toFixed(2)} %`, tono: 'info' as const },
    { id: 'kpi-cobros' as const, label: 'Cobros', valor: money(kpis.cobrosCent), tono: 'success' as const },
    { id: 'kpi-pagos' as const, label: 'Pagos', valor: money(kpis.pagosCent), tono: 'neutral' as const },
    { id: 'kpi-cxc' as const, label: 'CxC saldo', valor: money(kpis.cxcSaldoCent), tono: 'warning' as const },
    { id: 'kpi-cxp' as const, label: 'CxP saldo', valor: money(kpis.cxpSaldoCent), tono: 'warning' as const }
  ].filter((t) => visible(t.id)).sort((a, b) => orden(a.id) - orden(b.id))) : []

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Panel ejecutivo 2027"
        subtitle="Indicadores, tendencias y alertas calculados sobre documentos reales de SQLite."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
            <Button variant="secondary" size="sm" disabled={!datos} onClick={() => datos && descargarCsv(datos)}>
              <Download size={14} /> Exportar CSV
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Período">
            <select className={inputClass} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="MES">Mes actual</option>
              <option value="TRIMESTRE">Últimos 3 meses</option>
              <option value="ANIO">Año en curso</option>
              <option value="PERSONALIZADO">Personalizado</option>
            </select>
          </Field>
          {periodo === 'PERSONALIZADO' && (
            <>
              <Field label="Desde">
                <TextInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <TextInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </Field>
            </>
          )}
          {datos && <Badge tone="accent">{datos.periodo.desde} → {datos.periodo.hasta}</Badge>}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(tarjetas.length ? tarjetas : ([
          { id: 'kpi-ventas' as const, label: 'Ventas' },
          { id: 'kpi-compras' as const, label: 'Compras' },
          { id: 'kpi-utilidad' as const, label: 'Utilidad' },
          { id: 'kpi-margen' as const, label: 'Margen' },
          { id: 'kpi-cobros' as const, label: 'Cobros' },
          { id: 'kpi-pagos' as const, label: 'Pagos' },
          { id: 'kpi-cxc' as const, label: 'CxC' },
          { id: 'kpi-cxp' as const, label: 'CxP' }
        ] as const).filter((t) => visible(t.id)).sort((a, b) => orden(a.id) - orden(b.id)).map((t) => ({
          ...t, valor: '—', tono: 'neutral' as const
        }))).map((t) => (
          <div key={t.label} className={`erp-card rounded-xl border border-slate-200 bg-white ${compacta ? 'p-2.5' : 'p-3.5'} dark:border-slate-800 dark:bg-slate-900`}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{t.valor}</p>
            <div className="mt-1"><Badge tone={t.tono}>Real</Badge></div>
          </div>
        ))}
      </div>

      {datos && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            {visible('tendencia') && <div style={{ order: orden('tendencia') }}>
            <Card className={compacta ? 'p-2' : ''} title="Ventas mensuales" subtitle="Últimos 12 meses hasta el período seleccionado.">
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datos.serieMensual} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="clave" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Legend />
                    <Area type="monotone" dataKey="ventasCent" name="Ventas" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.16} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            </div>}

            {visible('formas-pago') && <div style={{ order: orden('formas-pago') }}>
            <Card className={compacta ? 'p-2' : ''} title="Formas de pago" subtitle="Distribución de los cobros del período.">
              <div className="h-[260px]">
                {datos.porFormaPago.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={datos.porFormaPago} dataKey="montoCent" nameKey="clave" outerRadius={90} label>
                        {datos.porFormaPago.map((_, i) => <Cell key={i} fill={colores[i % colores.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">Sin pagos registrados.</p>
                )}
              </div>
            </Card>
            </div>}
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            {visible('top-clientes') && <div style={{ order: orden('top-clientes') }}>
            <Card className={compacta ? 'p-2' : ''} title="Principales clientes" subtitle="Por importe facturado en el período.">
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datos.topClientes.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="cliente" width={120} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Bar dataKey="totalCent" name="Facturado" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            </div>}

            {visible('alertas') && <div style={{ order: orden('alertas') }}>
            <Card className={compacta ? 'p-2' : ''} title="Alertas y módulos 2026" subtitle="Señales tempranas con datos reales.">
              <div className="space-y-2 text-sm">
                {datos.alertas.length === 0 && <p className="text-slate-400">Sin alertas activas.</p>}
                {datos.alertas.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                    <span>{a.texto}</span>
                    <Badge tone={a.nivel === 'Alto' ? 'danger' : a.nivel === 'Medio' ? 'warning' : 'info'}>{a.nivel}</Badge>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {[
                    ['Presupuestos aprobados', datos.modulos.presupuestosAprobados],
                    ['Presupuesto disponible', datos.modulos.presupuestoDisponibleCent === null ? null : money(datos.modulos.presupuestoDisponibleCent)],
                    ['Órdenes de servicio', datos.modulos.ordenesAbiertas],
                    ['Oportunidades CRM', datos.modulos.leadsAbiertos]
                  ].map(([label, valor]) => (
                    <div key={String(label)} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500">{label}</p>
                      <p className="font-semibold">{valor === null ? '—' : String(valor)}</p>
                    </div>
                  ))}
                </div>
                <p className="flex items-center gap-1.5 pt-2 text-xs text-slate-400">
                  <TrendingUp size={13} /> Clientes activos: {number(kpis?.clientesActivos ?? 0)} ·
                  Productos: {number(kpis?.productosActivos ?? 0)}
                </p>
              </div>
            </Card>
            </div>}
          </div>

          {visible('top-productos') && <div style={{ order: orden('top-productos') }}>
          <Card className={compacta ? 'p-2' : ''} title="Productos más facturados" subtitle="Top 10 del período seleccionado.">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-2">Producto</th><th className="py-2 text-right">Cantidad</th><th className="py-2 text-right">Importe</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {datos.topProductos.map((p) => (
                    <tr key={p.producto}>
                      <td className="py-2">{p.producto}</td>
                      <td className="py-2 text-right">{number(p.cantidad)}</td>
                      <td className="py-2 text-right font-medium">{money(p.totalCent)}</td>
                    </tr>
                  ))}
                  {datos.topProductos.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">Sin datos.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          </div>}
        </>
      )}
    </div>
  )
}

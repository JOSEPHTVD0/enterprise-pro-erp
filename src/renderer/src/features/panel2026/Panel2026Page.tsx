import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { Download, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/Toast'
import { errorInfo } from '@/app/session'
import {
  eventoDeTexto, money, nivelVisible, number, usePreferenciasInterfaz
} from '@/lib/format'

type Vista = 'OPERATIVA' | 'FINANCIERA' | 'RIESGO'
type Periodo = 'MES' | 'TRIMESTRE' | 'ANIO'
type Metrica = 'VENTAS' | 'COBROS' | 'CXC' | 'STOCK'
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

interface Panel2026Resumen {
  periodo: { desde: string; hasta: string; tipo: string; vista: string; metricaPrincipal: string }
  kpis: {
    ventasCent: number
    comprasCent: number
    cobrosCent: number
    pagosCent: number
    cxcSaldoCent: number
    cxpSaldoCent: number
    cxcVencido: number
    sinStock: number
    stockBajo: number
    utilidadCent: number | null
    margenBp: number | null
  }
  tendencia: { clave: string; ventasCent: number; comprasCent: number }[]
  proyeccion: { fecha: string; montoCent: number }[]
  envejecimiento: { bucket: string; saldoCent: number; documentos: number }[]
  topClientes: { cliente: string; totalCent: number; documentos: number }[]
  topProductos: { producto: string; totalCent: number; cantidad: number }[]
  modulos: {
    presupuestosAprobados: number | null
    ordenesAbiertas: number | null
    leadsAbiertos: number | null
    activosActivos: number | null
  }
  alertas: { nivel: string; texto: string }[]
  /** Opcional: el backend lo omite si `panel2026.compararPeriodo` está desactivado. */
  comparacion?: { desde: string; hasta: string; ventas?: Comparacion; cobros?: Comparacion } | null
  config: {
    vista: string
    metricaPrincipal: string
    diasProyeccion: number
    umbralCxcDias: number
    umbralStockBajo: number
    filas: number
    compararPeriodo: boolean
    mostrarAlertas: boolean
    nivelMinimo: 'INFO' | 'MEDIO' | 'ALTO'
    seriesPorDefecto: 'DIA' | 'MES'
  }
}

interface Comparacion {
  actualCent: number
  anteriorCent: number
  deltaCent: number
  deltaPct: number | null
}

interface FilaEnvejecimiento {
  bucket: string
  saldoCent: number
  documentos: number
}
interface FilaCliente {
  cliente: string
  totalCent: number
  documentos: number
}
interface FilaProducto {
  producto: string
  totalCent: number
  cantidad: number
}

const VISTAS: Vista[] = ['OPERATIVA', 'FINANCIERA', 'RIESGO']
const PERIODOS: Periodo[] = ['MES', 'TRIMESTRE', 'ANIO']
const METRICAS: Metrica[] = ['VENTAS', 'COBROS', 'CXC', 'STOCK']

const etiquetasBucket: Record<string, string> = {
  AL_DIA: 'Al día',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
  CRITICO: 'Crítico'
}

function etiquetaBucket(bucket: string): string {
  return etiquetasBucket[bucket] ?? bucket.replaceAll('_', ' ')
}

function tonoAlerta(nivel: string): Tone {
  const n = nivel.toUpperCase()
  if (n === 'ALTO' || n === 'CRITICO') return 'danger'
  if (n === 'MEDIO') return 'warning'
  return 'info'
}

function descargarCsv(datos: Panel2026Resumen): void {
  const escapar = (valor: unknown): string => `"${String(valor ?? '').replace(/"/g, '""')}"`
  const k = datos.kpis
  const filas: unknown[][] = [
    ['Indicador', 'Valor'],
    ['Desde', datos.periodo.desde], ['Hasta', datos.periodo.hasta],
    ['Vista', datos.periodo.vista], ['Período', datos.periodo.tipo],
    ['Métrica principal', datos.periodo.metricaPrincipal],
    ['Ventas', money(k.ventasCent)], ['Compras', money(k.comprasCent)],
    ['Cobros', money(k.cobrosCent)], ['Pagos', money(k.pagosCent)],
    ['CxC saldo', money(k.cxcSaldoCent)], ['CxP saldo', money(k.cxpSaldoCent)],
    ['CxC vencido', number(k.cxcVencido)],
    ['Sin stock', number(k.sinStock)], ['Stock bajo', number(k.stockBajo)],
    ['Utilidad', k.utilidadCent === null ? 'Sin permiso' : money(k.utilidadCent)],
    ...datos.alertas.map((a) => [`Alerta ${a.nivel}`, a.texto]),
    ...datos.envejecimiento.map((a) => [
      `Envejecimiento ${etiquetaBucket(a.bucket)}`,
      `${money(a.saldoCent)} (${number(a.documentos)} documentos)`
    ]),
    ...datos.proyeccion.map((p) => [`Proyección ${p.fecha}`, money(p.montoCent)]),
    ...datos.topClientes.map((c) => [
      `Cliente ${c.cliente}`, `${money(c.totalCent)} (${number(c.documentos)} documentos)`
    ]),
    ...datos.topProductos.map((p) => [
      `Producto ${p.producto}`, `${money(p.totalCent)} (${number(p.cantidad)} unidades)`
    ])
  ]
  const csv = filas.map((fila) => fila.map(escapar).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `panel-2026-${datos.periodo.hasta}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}

function textoComparacion(c: Comparacion | undefined): string {
  if (!c) return 'no disponible en esta vista'
  const pct = c.deltaPct === null ? 's/n' : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct.toFixed(2)} %`
  return `${money(c.anteriorCent)} → ${money(c.actualCent)} (${pct})`
}

/** Radar 2026: todos los importes y conteos son los que calcula el backend en SQLite. */
export function Panel2026Page(): React.JSX.Element {
  const [vista, setVista] = useState<Vista>('OPERATIVA')
  const [periodo, setPeriodo] = useState<Periodo>('ANIO')
  const [metricaPrincipal, setMetricaPrincipal] = useState<Metrica>('VENTAS')
  const [datos, setDatos] = useState<Panel2026Resumen | null>(null)
  const [cargando, setCargando] = useState(false)
  const inicializado = useRef(false)
  const preferencias = usePreferenciasInterfaz()

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      const resumen = await window.api.invoke<Panel2026Resumen>('panel2026.resumen', {
        vista, periodo, metricaPrincipal
      })
      setDatos(resumen)
      if (!inicializado.current) {
        inicializado.current = true
        if (VISTAS.includes(resumen.config.vista as Vista)) setVista(resumen.config.vista as Vista)
        if (METRICAS.includes(resumen.config.metricaPrincipal as Metrica)) {
          setMetricaPrincipal(resumen.config.metricaPrincipal as Metrica)
        }
      }
    } catch (e) {
      setDatos(null)
      toast.error(errorInfo(e).message)
    } finally {
      setCargando(false)
    }
  }, [vista, periodo, metricaPrincipal])

  useEffect(() => { void cargar() }, [cargar])

  const alertasVisibles = (datos?.alertas ?? []).filter(
    (a) => datos?.config.mostrarAlertas !== false
      && nivelVisible(a.nivel, preferencias.alertas.nivelMinimo)
  )

  // Avisos de panel: una sola vez por firma y sujetos a filtros de evento/destino/nivel.
  useEffect(() => {
    for (const alerta of alertasVisibles) {
      const evento = eventoDeTexto(alerta.texto)
      if (evento) toast.evento(evento, alerta.texto, `panel2026:${alerta.nivel}:${alerta.texto}`)
    }
  }, [datos, preferencias.alertas.nivelMinimo])

  const kpis = datos?.kpis
  const principal = {
    VENTAS: 'Ventas',
    COBROS: 'Cobros',
    CXC: 'CxC saldo',
    STOCK: 'Sin stock'
  } as const
  const tono = (etiqueta: string): Tone => principal[metricaPrincipal] === etiqueta ? 'accent' : 'neutral'
  const tarjetas = kpis ? [
    { id: 'ventas', label: 'Ventas', valor: money(kpis.ventasCent), badge: tono('Ventas') },
    { id: 'cobros', label: 'Cobros', valor: money(kpis.cobrosCent), badge: tono('Cobros') },
    { id: 'cxc', label: 'CxC saldo', valor: money(kpis.cxcSaldoCent), badge: tono('CxC saldo') },
    { id: 'cxp', label: 'CxP saldo', valor: money(kpis.cxpSaldoCent), badge: 'neutral' as Tone },
    { id: 'cxc-vencido', label: 'CxC vencido', valor: number(kpis.cxcVencido), badge: 'warning' as Tone },
    { id: 'sin-stock', label: 'Sin stock', valor: number(kpis.sinStock), badge: tono('Sin stock') },
    { id: 'stock-bajo', label: 'Stock bajo', valor: number(kpis.stockBajo), badge: 'info' as Tone },
    {
      id: 'utilidad', label: 'Utilidad',
      valor: kpis.utilidadCent === null ? 'Sin permiso' : money(kpis.utilidadCent),
      badge: kpis.utilidadCent === null ? ('neutral' as Tone) : ('success' as Tone)
    }
  ] : []

  const columnasEnvejecimiento: Column<FilaEnvejecimiento>[] = [
    { key: 'bucket', header: 'Bucket', value: (f) => etiquetaBucket(f.bucket) },
    { key: 'saldoCent', header: 'Saldo', value: (f) => money(f.saldoCent) },
    { key: 'documentos', header: 'Documentos', value: (f) => number(f.documentos) }
  ]
  const columnasClientes: Column<FilaCliente>[] = [
    { key: 'cliente', header: 'Cliente', value: (f) => f.cliente },
    { key: 'totalCent', header: 'Importe', value: (f) => money(f.totalCent) },
    { key: 'documentos', header: 'Documentos', value: (f) => number(f.documentos) }
  ]
  const columnasProductos: Column<FilaProducto>[] = [
    { key: 'producto', header: 'Producto', value: (f) => f.producto },
    { key: 'totalCent', header: 'Importe', value: (f) => money(f.totalCent) },
    { key: 'cantidad', header: 'Cantidad', value: (f) => number(f.cantidad) }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Panel operativo 2026"
        subtitle="Datos reales de SQLite sobre vistas, umbrales y permisos del perfil. Los cálculos y autorizaciones se verifican en backend."
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
          <Field label="Vista">
            <select className={inputClass} value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
              {VISTAS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Período">
            <select className={inputClass} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              {PERIODOS.map((p) => (
                <option key={p} value={p}>
                  {p === 'MES' ? 'Mes actual' : p === 'TRIMESTRE' ? 'Últimos 3 meses' : 'Año en curso'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Métrica principal">
            <select className={inputClass} value={metricaPrincipal} onChange={(e) => setMetricaPrincipal(e.target.value as Metrica)}>
              {METRICAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          {datos && (
            <Badge tone="accent">{datos.periodo.desde} → {datos.periodo.hasta}</Badge>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(tarjetas.length ? tarjetas : ([
          { id: 'ventas', label: 'Ventas' }, { id: 'cobros', label: 'Cobros' },
          { id: 'cxc', label: 'CxC saldo' }, { id: 'cxp', label: 'CxP saldo' },
          { id: 'cxc-vencido', label: 'CxC vencido' }, { id: 'sin-stock', label: 'Sin stock' },
          { id: 'stock-bajo', label: 'Stock bajo' }, { id: 'utilidad', label: 'Utilidad' }
        ]).map((t) => ({ ...t, valor: '—', badge: 'neutral' as Tone }))).map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{t.valor}</p>
            <div className="mt-1"><Badge tone={t.badge}>{t.badge === 'accent' ? 'Principal' : 'Real'}</Badge></div>
          </div>
        ))}
      </div>

      {datos && (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card title="Tendencia mensual real" subtitle="Ventas y compras del período calculadas desde documentos reales.">
              <div className="h-[260px]">
                {datos.tendencia.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={datos.tendencia} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis dataKey="clave" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                      <Area type="monotone" dataKey="ventasCent" name="Ventas" stroke="var(--erp-acento)" fill="var(--erp-acento)" fillOpacity={0.16} />
                      <Area type="monotone" dataKey="comprasCent" name="Compras" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.14} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    Sin datos de tendencia para el período seleccionado.
                  </p>
                )}
              </div>
            </Card>

            <Card title="Proyección de efectivo" subtitle={`Próximos ${datos.config.diasProyeccion} días según los vencimientos reales.`}>
              <div className="h-[260px]">
                {datos.proyeccion.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datos.proyeccion} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Bar dataKey="montoCent" name="Efectivo proyectado">
                        {datos.proyeccion.map((p, i) => (
                          <Cell key={i} fill={p.montoCent >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    Sin proyección disponible para los umbrales actuales.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <Card
            className="mb-4"
            title="Comparación con período anterior"
            subtitle={datos.comparacion
              ? `${datos.comparacion.desde} → ${datos.comparacion.hasta}`
              : 'Datos de comparación no disponibles en esta vista.'}
          >
            {datos.config.compararPeriodo === false ? (
              <p className="text-sm text-slate-400">La comparación está desactivada en el Centro de control.</p>
            ) : !datos.comparacion ? (
              <p className="text-sm text-slate-400">no disponible en esta vista</p>
            ) : (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs text-slate-500">Ventas</p>
                  <p className="font-medium">{textoComparacion(datos.comparacion.ventas)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs text-slate-500">Cobros</p>
                  <p className="font-medium">{textoComparacion(datos.comparacion.cobros)}</p>
                </div>
              </div>
            )}
          </Card>

          <Card className="mb-4" title="Envejecimiento de CxC" subtitle="Saldos reales por bucket, con el umbral configurado en el Centro de control.">
            <DataTable<FilaEnvejecimiento>
              columns={columnasEnvejecimiento}
              data={datos.envejecimiento}
              rowKey={(f) => f.bucket}
              storageKey="panel2026-envejecimiento"
              searchPlaceholder="Buscar bucket…"
              pageSize={6}
              emptyText="Sin saldos por envejecimiento."
            />
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card title="Top clientes" subtitle="Clientes con mayor importe en el período.">
              <DataTable<FilaCliente>
                columns={columnasClientes}
                data={datos.topClientes}
                rowKey={(f) => f.cliente}
                storageKey="panel2026-clientes"
                searchPlaceholder="Buscar cliente…"
                pageSize={6}
                emptyText="Sin clientes en el período."
              />
            </Card>
            <Card title="Top productos" subtitle="Productos con mayor importe en el período.">
              <DataTable<FilaProducto>
                columns={columnasProductos}
                data={datos.topProductos}
                rowKey={(f) => f.producto}
                storageKey="panel2026-productos"
                searchPlaceholder="Buscar producto…"
                pageSize={6}
                emptyText="Sin productos en el período."
              />
            </Card>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card title="Alertas 2026" subtitle="Señales sobre umbrales reales, filtradas por nivel mínimo.">
              {!datos.config.mostrarAlertas ? (
                <p className="text-sm text-slate-400">Las alertas están desactivadas en el Centro de control.</p>
              ) : alertasVisibles.length === 0 ? (
                <p className="text-sm text-slate-400">Sin alertas activas con los umbrales actuales.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {alertasVisibles.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                      <span>{a.texto}</span>
                      <Badge tone={tonoAlerta(a.nivel)}>{a.nivel}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Módulos 2026" subtitle="Actividad de los módulos incorporados en las fases 13 y 14.">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Presupuestos aprobados', datos.modulos.presupuestosAprobados],
                  ['Órdenes abiertas', datos.modulos.ordenesAbiertas],
                  ['Leads abiertos', datos.modulos.leadsAbiertos],
                  ['Activos activos', datos.modulos.activosActivos]
                ].map(([label, valor]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                    <p className="text-[11px] text-slate-500">{label}</p>
                    <p className="font-semibold">{valor === null ? '—' : number(valor)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <p className="text-xs text-slate-400">
            * Umbrales aplicados: CxC {preferencias.alertas.cxcDiasVencimiento} días · stock {preferencias.alertas.stockBajoUmbral} ·
            series restantes {preferencias.alertas.seriesRestantes} ·
            proyección {datos.config.diasProyeccion} días · filas {datos.config.filas}.
            Los límites se administran en el Centro de control.
          </p>
        </>
      )}
    </div>
  )
}

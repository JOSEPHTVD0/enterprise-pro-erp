import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { BarChart3, RefreshCw } from 'lucide-react'
import { can } from '@/app/session'
import { useAjustesStore } from '@/app/ajustes-store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'
import type { Indicadores, Serie } from '@/features/reportes/types'
import { FiltrosComerciales } from './FiltrosComerciales'
import { filtroComercialVacio, payloadFiltroComercial, type FiltroComercial } from './filtros-comerciales'
import { num, txt, type Fila } from './types'

type Vista = 'resumen' | 'documentos' | 'cobros'

const columnasResumen: Column<Fila>[] = [
  { key: 'origen', header: 'Origen', value: (f) => txt(f.origen), render: (f) => <Badge tone="accent">{txt(f.origen)}</Badge> },
  { key: 'numero', header: 'Número', value: (f) => txt(f.numero), render: (f) => <span className="font-medium">{txt(f.numero)}</span> },
  { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) || '—' },
  { key: 'tipo', header: 'Tipo', value: (f) => txt(f.tipo) || '—' },
  { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
  {
    key: 'importeCent', header: 'Importe', value: (f) => num(f.importeCent),
    render: (f) => <span className="tabular-nums">{money(num(f.importeCent))}</span>
  },
  {
    key: 'saldoCent', header: 'Saldo', value: (f) => num(f.saldoCent),
    render: (f) => <span className="tabular-nums">{money(num(f.saldoCent))}</span>
  },
  { key: 'estado', header: 'Estado', value: (f) => txt(f.estado), render: (f) => <Badge>{txt(f.estado) || '—'}</Badge> }
]

/** Panel comercial unificado: solo consulta canales reales ya existentes. */
export function PanelComercialPage(): React.JSX.Element {
  const umbralCxc = useAjustesStore((s) => s.ajustes.panel2026?.umbralCxcDias ?? 15)
  const [vista, setVista] = useState<Vista>('resumen')
  const [filtro, setFiltro] = useState<FiltroComercial>(filtroComercialVacio)
  const [aplicado, setAplicado] = useState<FiltroComercial>(filtroComercialVacio)
  const [granularidad, setGranularidad] = useState<'DIA' | 'MES'>('DIA')
  const [documentos, setDocumentos] = useState<Fila[]>([])
  const [cartera, setCartera] = useState<Fila[]>([])
  const [recibos, setRecibos] = useState<Fila[]>([])
  const [anticipos, setAnticipos] = useState<Fila[]>([])
  const [clientes, setClientes] = useState<Fila[]>([])
  const [productos, setProductos] = useState<Fila[]>([])
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [serie, setSerie] = useState<Serie | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    const tareas: Promise<unknown>[] = []
    if (can('reportes.consultar')) {
      tareas.push(Promise.all([
        window.api.invoke<Indicadores>('reportes.indicadores'),
        window.api.invoke<Serie>('reportes.serie', { granularidad })
      ]).then(([ind, puntos]) => {
        if (activo) { setIndicadores(ind); setSerie(puntos) }
      }))
    }
    if (can('ventas.consultar')) {
      tareas.push(window.api.invoke<{ clientes?: Fila[]; productos?: Fila[] }>('ventas.catalogos')
        .then((catalogos) => {
          if (!activo) return
          setClientes(Array.isArray(catalogos?.clientes) ? catalogos.clientes : [])
          setProductos(Array.isArray(catalogos?.productos) ? catalogos.productos : [])
        }))
    } else if (can('cobros.consultar') || can('cxc.consultar')) {
      tareas.push(window.api.invoke<{ clientes?: Fila[] }>('finanzas.catalogos')
        .then((catalogos) => {
          if (activo) setClientes(Array.isArray(catalogos?.clientes) ? catalogos.clientes : [])
        }))
    }
    void Promise.allSettled(tareas).then(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [granularidad])

  useEffect(() => {
    let activo = true
    setCargando(true)
    const payload = { ...payloadFiltroComercial(aplicado), limite: 1000 }
    const tareas: Promise<unknown>[] = []
    if (can('ventas.consultar')) {
      tareas.push(window.api.invoke<Fila[]>('ventas.documentos', payload)
        .then((filas) => { if (activo) setDocumentos(Array.isArray(filas) ? filas : []) }))
    } else {
      tareas.push(Promise.resolve().then(() => { if (activo) setDocumentos([]) }))
    }
    if (can('cobros.consultar')) {
      tareas.push(Promise.all([
        window.api.invoke<Fila[]>('cobros.documentos', payload),
        window.api.invoke<Fila[]>('cobros.recibos', payload),
        window.api.invoke<Fila[]>('cobros.anticipos', payload)
      ]).then(([docs, recs, ants]) => {
        if (!activo) return
        setCartera(Array.isArray(docs) ? docs : [])
        setRecibos(Array.isArray(recs) ? recs : [])
        setAnticipos(Array.isArray(ants) ? ants : [])
      }))
    } else {
      tareas.push(Promise.resolve().then(() => {
        if (activo) { setCartera([]); setRecibos([]); setAnticipos([]) }
      }))
    }
    void Promise.allSettled(tareas).then((resultados) => {
      if (!activo) return
      if (resultados.some((r) => r.status === 'rejected')) toast.error('No se pudieron cargar todos los listados del panel.')
      setCargando(false)
    })
    return () => { activo = false }
  }, [aplicado])

  const suma = (filas: Fila[], clave: string): number => filas.reduce(
    (total, fila) => total + (txt(fila.estado) === 'ANULADO' ? 0 : num(fila[clave])), 0
  )

  const facturado = useMemo(() => suma(documentos, 'totalCent'), [documentos])
  const pendiente = useMemo(() => suma(cartera, 'saldoCent'), [cartera])
  const cobrado = useMemo(() => suma(recibos, 'montoCent'), [recibos])
  const disponibleAnticipos = useMemo(() => suma(anticipos, 'saldoCent'), [anticipos])
  const vencidas = useMemo(() => cartera.filter((fila) =>
    txt(fila.estado) !== 'ANULADO' && num(fila.antiguedadDias) > umbralCxc
  ).length, [cartera, umbralCxc])

  const filasUnificadas = useMemo<Fila[]>(() => [
    ...documentos.map((f) => ({
      ...f, origen: 'VENTAS', numero: txt(f.numero), clienteNombre: txt(f.clienteNombre),
      tipo: txt(f.tipo), importeCent: num(f.totalCent), saldoCent: num(f.saldoPendienteCent ?? f.saldoCent)
    })),
    ...cartera.map((f) => ({
      ...f, origen: 'CXC', numero: txt(f.numeroDocumento) || txt(f.numero), tipo: 'CARGO',
      importeCent: num(f.montoCent), saldoCent: num(f.saldoCent)
    })),
    ...recibos.map((f) => ({
      ...f, origen: 'COBROS', numero: txt(f.numero), tipo: txt(f.metodo),
      importeCent: num(f.montoCent), saldoCent: 0
    })),
    ...anticipos.map((f) => ({
      ...f, origen: 'ANTICIPOS', numero: txt(f.numero) || txt(f.referencia) || `#${num(f.id)}`,
      clienteNombre: txt(f.clienteNombre) || txt(f.entidadNombre), tipo: 'ANTICIPO',
      importeCent: num(f.montoCent), saldoCent: num(f.saldoCent)
    }))
  ], [documentos, cartera, recibos, anticipos])

  const filasVisibles = useMemo(() => {
    if (vista === 'documentos') return filasUnificadas.filter((f) => ['VENTAS', 'CXC'].includes(txt(f.origen)))
    if (vista === 'cobros') return filasUnificadas.filter((f) => ['COBROS', 'ANTICIPOS'].includes(txt(f.origen)))
    return filasUnificadas
  }, [filasUnificadas, vista])

  const topClientes = useMemo(() => {
    const totales = new Map<string, number>()
    for (const fila of documentos) {
      if (txt(fila.estado) === 'ANULADO') continue
      const nombre = txt(fila.clienteNombre) || 'Sin cliente'
      totales.set(nombre, (totales.get(nombre) ?? 0) + num(fila.totalCent))
    }
    return [...totales.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nombre, totalCent]) => ({ nombre, totalCent }))
  }, [documentos])

  const puntosGrafica = useMemo(() => (serie?.puntos ?? []).map((punto) => ({
    clave: punto.clave,
    Ventas: punto.ventasCent / 100,
    Cobros: punto.cobrosCent / 100
  })), [serie])

  const tarjetas = [
    { etiqueta: 'Ventas del día', valor: indicadores ? money(indicadores.ventasHoyCent) : '—' },
    { etiqueta: 'Ventas del mes', valor: indicadores ? money(indicadores.ventasMesCent) : '—' },
    { etiqueta: 'Facturado (filtro)', valor: money(facturado) },
    { etiqueta: 'CxC pendiente', valor: money(indicadores ? indicadores.cxcSaldoCent : pendiente) },
    { etiqueta: 'Cobrado (filtro)', valor: money(cobrado) },
    { etiqueta: 'Anticipos disponibles', valor: money(disponibleAnticipos) },
    { etiqueta: 'Documentos vencidos', valor: String(vencidas) },
    { etiqueta: 'Ticket promedio', valor: documentos.length ? money(Math.round(facturado / documentos.length)) : '—' }
  ]

  return (
    <>
      <PageHeader
        title="Panel comercial"
        subtitle="Resumen unificado de ventas, facturación y cobros con datos reales de SQLite."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setGranularidad(granularidad === 'DIA' ? 'MES' : 'DIA')}>
              Serie {granularidad === 'DIA' ? 'diaria' : 'mensual'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAplicado(filtro)}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
          </>
        }
      />

      <FiltrosComerciales
        filtro={filtro}
        onChange={setFiltro}
        onAplicar={() => setAplicado(filtro)}
        onLimpiar={() => setAplicado(filtroComercialVacio())}
        clientes={clientes}
        productos={productos}
        titulo="Búsqueda filtrada unificada"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map((tarjeta) => (
          <div key={tarjeta.etiqueta}
            className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{tarjeta.etiqueta}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{tarjeta.valor}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Evolución de ventas y cobros"
          subtitle={can('reportes.consultar') ? `Granularidad ${granularidad.toLowerCase()}` : 'Sin permiso de reportes'}>
          {puntosGrafica.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={puntosGrafica} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="clave" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="Ventas" stroke="#6366f1" fill="#6366f1" fillOpacity={0.16} />
                  <Area type="monotone" dataKey="Cobros" stroke="#10b981" fill="#10b981" fillOpacity={0.16} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">No hay serie disponible para este período.</p>
          )}
        </Card>

        <Card title="Concentración por cliente" subtitle="Top 5 del filtro aplicado">
          {topClientes.length ? (
            <div className="flex flex-col gap-3">
              {topClientes.map((cliente) => (
                <div key={cliente.nombre}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{cliente.nombre}</span>
                    <span className="tabular-nums">{money(cliente.totalCent)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.round((cliente.totalCent / (topClientes[0]?.totalCent || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">Sin ventas en el filtro actual.</p>
          )}
        </Card>
      </div>

      <Tabs
        tabs={[
          { id: 'resumen', label: `Resumen unificado (${filasUnificadas.length})` },
          { id: 'documentos', label: 'Documentos' },
          { id: 'cobros', label: 'Cobros y anticipos' }
        ]}
        active={vista}
        onChange={(id) => setVista(id as Vista)}
      />

      <TabPanel>
        <Card title="Detalle del panel" subtitle={`${filasVisibles.length} fila(s) · CSV disponible según preferencias`}>
          <DataTable
            columns={columnasResumen}
            data={filasVisibles}
            rowKey={(f) => `${txt(f.origen)}-${num(f.id)}-${txt(f.numero)}`}
            storageKey={`panel-comercial.${vista}`}
            searchPlaceholder="Buscar por número, cliente o estado…"
            emptyText={cargando ? 'Cargando…' : 'No hay registros con estos filtros.'}
          />
          <p className="mt-3 text-xs text-slate-500">
            Los importes vienen de los servicios reales. El filtro por producto se aplica en backend contra las líneas de venta; el estado y el saldo no se recalculan en la interfaz.
          </p>
        </Card>
      </TabPanel>

      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <BarChart3 size={14} />
        <span>DGI: solo rotulado visual configurado en Centro de control. No hay envío ni emisión e-CF.</span>
      </div>
    </>
  )
}

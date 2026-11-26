import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { useAppStore } from '@/app/store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money, nivelVisible, usePreferenciasInterfaz } from '@/lib/format'
import { coincideTexto } from '@shared/texto'
import { num, pendienteCent, txt, type Fila } from '@/features/finanzas/types'

interface Comprobacion {
  nombre: string
  estado: 'ok' | 'advertencia' | 'error'
  detalle: string
}

const hoyISO = (): string => new Date().toISOString().slice(0, 10)

function diasPara(vencimiento: string): number | null {
  if (!vencimiento) return null
  const fecha = Date.parse(`${vencimiento}T00:00:00Z`)
  const hoy = Date.parse(`${hoyISO()}T00:00:00Z`)
  if (!Number.isFinite(fecha) || !Number.isFinite(hoy)) return null
  return Math.round((fecha - hoy) / 86_400_000)
}

export function AgendaPage(): React.JSX.Element {
  const [tab, setTab] = useState('cobros')
  const [cobros, setCobros] = useState<Fila[]>([])
  const [pagos, setPagos] = useState<Fila[]>([])
  const [salud, setSalud] = useState<Comprobacion[]>([])
  const [estado, setEstado] = useState('TODOS')
  const [texto, setTexto] = useState('')
  const preferencias = usePreferenciasInterfaz()
  const umbral = preferencias.alertas.cxcDiasVencimiento
  const verCobros = can('cobros.consultar')
  const verPagos = can('cxp.consultar')
  const verSalud = can('salud.consultar')

  useEffect(() => {
    if (verCobros) {
      void window.api.invoke<Fila[]>('cobros.documentos', { limite: 500 })
        .then(setCobros).catch((e) => toast.error(errorInfo(e).message))
    }
    if (verPagos) {
      void window.api.invoke<Fila[]>('cxp.documentos', { limite: 500 })
        .then(setPagos).catch((e) => toast.error(errorInfo(e).message))
    }
    if (verSalud) {
      void window.api.invoke<{ comprobaciones: Comprobacion[] }>('salud.resumen')
        .then((res) => setSalud(res.comprobaciones ?? []))
        .catch(() => setSalud([]))
    }
  }, [verCobros, verPagos, verSalud])

  const clasificar = (fila: Fila): { dias: number | null; etiqueta: string; tono: 'danger' | 'warning' | 'success' } => {
    const dias = diasPara(txt(fila.vencimiento))
    if (dias === null) return { dias: null, etiqueta: 'SIN VENCIMIENTO', tono: 'success' }
    if (dias < 0) return { dias, etiqueta: 'VENCIDO', tono: 'danger' }
    if (dias <= umbral) return { dias, etiqueta: 'PRÓXIMO', tono: 'warning' }
    return { dias, etiqueta: 'AL DÍA', tono: 'success' }
  }

  const filtrar = (filas: Fila[]): Fila[] => {
    return filas.filter((f) => {
      if (pendienteCent(f) <= 0) return false
      const estadoFila = clasificar(f).etiqueta
      if (estado !== 'TODOS' && estadoFila !== estado) return false
      const contenido = [
        txt(f.numeroDocumento), txt(f.numero), txt(f.clienteNombre),
        txt(f.proveedorNombre), txt(f.vencimiento)
      ].join(' ')
      return coincideTexto(contenido, texto)
    }).sort((a, b) => txt(a.vencimiento).localeCompare(txt(b.vencimiento)))
  }

  const cobrosFiltrados = useMemo(() => filtrar(cobros), [cobros, estado, texto, umbral])
  const pagosFiltrados = useMemo(() => filtrar(pagos), [pagos, estado, texto, umbral])
  const totalCobros = cobrosFiltrados.reduce((suma, f) => suma + pendienteCent(f), 0)
  const totalPagos = pagosFiltrados.reduce((suma, f) => suma + pendienteCent(f), 0)
  const vencidos = [...cobrosFiltrados, ...pagosFiltrados].filter((f) => clasificar(f).etiqueta === 'VENCIDO').length

  useEffect(() => {
    if (vencidos > 0 && nivelVisible('MEDIO', preferencias.alertas.nivelMinimo)) {
      toast.evento('CXC_VENCIDO',
        `${vencidos} documento(s) vencido(s) en la agenda.`,
        `cxc-agenda:${vencidos}`)
    }
    for (const comprobacion of salud) {
      if (comprobacion.estado === 'ok') continue
      if (!/serie|correlativo|ncf/i.test(`${comprobacion.nombre} ${comprobacion.detalle}`)) continue
      const coincidencia = comprobacion.detalle.match(/(\d+)\s*(?:número|numero)/i)
      const restantes = coincidencia ? Number(coincidencia[1]) : Number.POSITIVE_INFINITY
      if (restantes > preferencias.alertas.seriesRestantes) continue
      const nivel = comprobacion.estado === 'error' ? 'ALTO' : 'MEDIO'
      if (!nivelVisible(nivel, preferencias.alertas.nivelMinimo)) continue
      toast.evento('SERIE_ALERTA', comprobacion.detalle,
        `serie:${comprobacion.nombre}:${comprobacion.detalle}`)
    }
  }, [vencidos, salud, preferencias.alertas.cxcDiasVencimiento,
    preferencias.alertas.seriesRestantes, preferencias.alertas.nivelMinimo])

  const columnas = (esCobro: boolean): Column<Fila>[] => [
    {
      key: 'numero', header: 'Documento',
      value: (f) => txt(f.numeroDocumento) || txt(f.numero) || `#${num(f.id)}`,
      render: (f) => <span className="font-medium">{txt(f.numeroDocumento) || txt(f.numero) || `#${num(f.id)}`}</span>
    },
    {
      key: 'entidad', header: esCobro ? 'Cliente' : 'Proveedor',
      value: (f) => esCobro ? txt(f.clienteNombre) : txt(f.proveedorNombre)
    },
    { key: 'vencimiento', header: 'Vencimiento', value: (f) => txt(f.vencimiento) || '—' },
    {
      key: 'dias', header: 'Días', value: (f) => clasificar(f).dias ?? 0,
      render: (f) => {
        const dias = clasificar(f).dias
        return dias === null ? '—' : dias < 0 ? `${Math.abs(dias)} tarde` : `${dias} restantes`
      }
    },
    {
      key: 'pendiente', header: 'Pendiente', value: (f) => pendienteCent(f),
      render: (f) => <span className="tabular-nums">{money(pendienteCent(f))}</span>
    },
    {
      key: 'estado', header: 'Situación', value: (f) => clasificar(f).etiqueta,
      render: (f) => <Badge tone={clasificar(f).tono}>{clasificar(f).etiqueta}</Badge>
    }
  ]

  function ir(vista: string): void {
    useAppStore.getState().setActiveView(vista)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Agenda de vencimientos"
        subtitle="Cobros y pagos pendientes ordenados por fecha real, con el umbral configurable desde el centro de control."
        actions={<Button variant="secondary" size="sm" onClick={() => ir('centro-control')}>
          Ajustar umbral <ArrowRight size={14} />
        </Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Por cobrar en agenda', valor: money(totalCobros) },
          { label: 'Por pagar en agenda', valor: money(totalPagos) },
          { label: 'Documentos vencidos', valor: String(vencidos) }
        ].map((tarjeta) => (
          <Card key={tarjeta.label}>
            <p className="text-xs text-slate-500">{tarjeta.label}</p>
            <p className="mt-1 text-xl font-semibold">{tarjeta.valor}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Situación">
            <select className={inputClass} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="TODOS">Todas</option>
              <option value="VENCIDO">Vencidos</option>
              <option value="PRÓXIMO">Próximos (≤ {umbral} días)</option>
              <option value="AL DÍA">Al día</option>
              <option value="SIN VENCIMIENTO">Sin vencimiento</option>
            </select>
          </Field>
          <Field label="Buscar" hint="Número, cliente, proveedor o fecha">
            <TextInput value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. FAC-00000012" />
          </Field>
          <div className="flex items-end">
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarClock size={14} /> Regla: vencido si la fecha ya pasó; próximo si faltan {umbral} días o menos.
            </p>
          </div>
        </div>
      </Card>

      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'cobros', label: 'Cobros por vencer' },
        { id: 'pagos', label: 'Pagos por vencer' },
        { id: 'series', label: 'Señales del sistema' }
      ]} />
      <TabPanel>
        {tab === 'cobros' && (
          <Card
            title="Cuentas por cobrar"
            subtitle="Creadas por Ventas; el cobro se registra en el módulo independiente Cobros."
            actions={verCobros ? <Button size="sm" variant="secondary" onClick={() => ir('cobros')}>Abrir Cobros</Button> : undefined}
          >
            {verCobros
              ? <DataTable columns={columnas(true)} data={cobrosFiltrados} rowKey={(f) => num(f.id)} />
              : <p className="text-sm text-slate-500">Su perfil no tiene `cobros.consultar`.</p>}
          </Card>
        )}
        {tab === 'pagos' && (
          <Card
            title="Cuentas por pagar"
            subtitle="Facturas de proveedores pendientes de pago."
            actions={verPagos ? <Button size="sm" variant="secondary" onClick={() => ir('cxp')}>Abrir CxP</Button> : undefined}
          >
            {verPagos
              ? <DataTable columns={columnas(false)} data={pagosFiltrados} rowKey={(f) => num(f.id)} />
              : <p className="text-sm text-slate-500">Su perfil no tiene `cxp.consultar`.</p>}
          </Card>
        )}
        {tab === 'series' && (
          <Card title="Salud del sistema" subtitle={`Solo comprobaciones que requieren atención · series ≤ ${preferencias.alertas.seriesRestantes} restantes.`}>
            {!verSalud ? <p className="text-sm text-slate-500">Su perfil no tiene `salud.consultar`.</p> : (
              salud.filter((c) => c.estado !== 'ok').length
                ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salud.filter((c) => c.estado !== 'ok').map((c) => (
                    <li key={c.nombre} className="flex items-center gap-3 py-2 text-sm">
                      <Badge tone={c.estado === 'error' ? 'danger' : 'warning'}>{c.estado}</Badge>
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-slate-500">{c.detalle}</span>
                    </li>
                  ))}
                </ul>
                : <p className="text-sm text-emerald-600">Todas las comprobaciones están correctas.</p>
            )}
          </Card>
        )}
      </TabPanel>
    </div>
  )
}

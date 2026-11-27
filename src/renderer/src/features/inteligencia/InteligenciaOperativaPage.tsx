import { useCallback, useEffect, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Field, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { money, number } from '@/lib/format'
import { toast } from '@/components/ui/Toast'

interface FilaAging { bucket: string; saldoCent: number; documentos: number }

interface Datos {
  periodo: { desde: string; hasta: string; tipo: string }
  tendencia: { clave: string; ventasCent: number; comprasCent: number }[]
  agingCxc: FilaAging[]
  agingCxp: FilaAging[]
  rotacion: {
    producto: string; cantidad: number; valorCent: number
    unidadesSalida: number; costoSalidasCent: number
  }[]
  rentabilidad: {
    producto: string; totalCent: number; costoCent: number | null; utilidadCent: number | null
  }[]
  flujo: { fecha: string; montoCent: number }[]
  auditoria: { dia: string; eventos: number; usuarios: number }[]
  modulos: {
    crm: { estado: string; leads: number; valorEstimadoCent: number; valorPonderadoCent: number }[]
    servicios: { estado: string; ordenes: number; totalCent: number; vencidas: number }[]
    activos: {
      categoria: string; estado: string; activos: number
      adquisicionCent: number; depreciacionCent: number; valorNetoCent: number
    }[]
  }
  diagnostico: {
    sinStock: number; stockBajo: number; cxcVencido: number; cxpVencido: number; seriesInactivas: number
  }
  alertas: { nivel: string; texto: string }[]
  umbrales: { stockBajo: number; cxcDias: number }
}

const etiquetasBucket: Record<string, string> = {
  AL_DIA: 'Al día', '1_30': '1–30 días', '31_60': '31–60 días',
  '61_90': '61–90 días', '90_PLUS': 'Más de 90'
}

/** Inteligencia operativa: cifras calculadas en SQLite por el proceso principal. */
export function InteligenciaOperativaPage(): React.JSX.Element {
  const [periodo, setPeriodo] = useState('ANIO')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      setDatos(await window.api.invoke<Datos>('inteligencia.resumen', { periodo }))
    } catch (e) {
      setDatos(null)
      toast.error('No se pudo cargar inteligencia operativa.')
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => { void cargar() }, [cargar])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inteligencia operativa"
        subtitle="Tendencias, aging, rotación, flujo y radar de módulos calculados con datos reales de SQLite."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Período">
            <select className={inputClass} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="MES">Mes actual</option>
              <option value="TRIMESTRE">Últimos 3 meses</option>
              <option value="ANIO">Año en curso</option>
            </select>
          </Field>
          {datos && <Badge tone="accent">{datos.periodo.desde} → {datos.periodo.hasta}</Badge>}
          <span className="text-xs text-slate-400">Los importes se muestran en la moneda configurada para la empresa.</span>
        </div>
      </Card>

      {!datos ? (
        <Card title="Sin datos">
          <p className="text-sm text-slate-400">
            {cargando ? 'Calculando indicadores…' : 'No hay información disponible para el período seleccionado.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {([
              ['Sin existencias', datos.diagnostico.sinStock, 'danger'],
              ['Stock bajo', datos.diagnostico.stockBajo, 'warning'],
              ['CxC vencida', datos.diagnostico.cxcVencido, 'danger'],
              ['CxP vencida', datos.diagnostico.cxpVencido, 'warning'],
              ['Series inactivas', datos.diagnostico.seriesInactivas, 'neutral']
            ] as [string, number, 'danger' | 'warning' | 'neutral'][]).map(([label, valor, tono]) => (
              <div key={String(label)} className="erp-card rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{number(valor as number)}</p>
                <div className="mt-1"><Badge tone={tono}>Real</Badge></div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Tendencia de operaciones" subtitle="Ventas y compras del período agrupadas por mes.">
              <div className="h-[260px]">
                {datos.tendencia.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={datos.tendencia} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis dataKey="clave" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={80} tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                      <Area type="monotone" dataKey="ventasCent" name="Ventas" stroke="var(--erp-acento)" fill="var(--erp-acento)" fillOpacity={0.16} />
                      <Area type="monotone" dataKey="comprasCent" name="Compras" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="flex h-full items-center justify-center text-sm text-slate-400">Sin movimientos en el período.</p>}
              </div>
            </Card>

            <Card title="Envejecimiento de CxC y CxP" subtitle="Saldos abiertos según vencimiento real del documento.">
              <div className="space-y-3 text-sm">
                {([['CxC', datos.agingCxc, '#4f46e5'], ['CxP', datos.agingCxp, '#f59e0b']] as const).map(([titulo, filas, color]) => (
                  <div key={titulo}>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{titulo}</p>
                    <div className="h-[100px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={filas} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                          <XAxis dataKey="bucket" tickFormatter={(v) => etiquetasBucket[String(v)] ?? String(v)} tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} width={70} tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} />
                          <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(v) => etiquetasBucket[String(v)] ?? String(v)} />
                          <Bar dataKey="saldoCent" name="Saldo" fill={color} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Rentabilidad por producto" subtitle="Costo y utilidad solo para perfiles con los permisos correspondientes.">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr><th className="py-2">Producto</th><th className="py-2 text-right">Ventas</th><th className="py-2 text-right">Costo</th><th className="py-2 text-right">Utilidad</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {datos.rentabilidad.map((p) => (
                      <tr key={p.producto}>
                        <td className="py-2">{p.producto}</td>
                        <td className="py-2 text-right">{money(p.totalCent)}</td>
                        <td className="py-2 text-right">{p.costoCent === null ? '—' : money(p.costoCent)}</td>
                        <td className="py-2 text-right font-medium">{p.utilidadCent === null ? 'Sin permiso' : money(p.utilidadCent)}</td>
                      </tr>
                    ))}
                    {datos.rentabilidad.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sin datos de rentabilidad.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Rotación de inventario" subtitle="Salidas reales del kardex frente a existencias valorizadas.">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr><th className="py-2">Producto</th><th className="py-2 text-right">Existencia</th><th className="py-2 text-right">Valor</th><th className="py-2 text-right">Salidas</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {datos.rotacion.map((p) => (
                      <tr key={p.producto}>
                        <td className="py-2">{p.producto}</td>
                        <td className="py-2 text-right">{number(p.cantidad)}</td>
                        <td className="py-2 text-right">{money(p.valorCent)}</td>
                        <td className="py-2 text-right">{number(p.unidadesSalida)}</td>
                      </tr>
                    ))}
                    {datos.rotacion.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sin existencias registradas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Flujo de efectivo proyectado" subtitle="Vencimientos de CxC y CxP de los próximos 28 días.">
              <div className="h-[240px]">
                {datos.flujo.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datos.flujo} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} width={80} tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Bar dataKey="montoCent" name="Flujo neto" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="flex h-full items-center justify-center text-sm text-slate-400">Sin vencimientos próximos.</p>}
              </div>
            </Card>

            <Card title="Actividad y radar 2026" subtitle="Eventos de auditoría y estado de CRM, servicios y activos según permisos.">
              <div className="space-y-3 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">Auditoría (7 días)</p>
                <div className="flex flex-wrap gap-2">
                  {datos.auditoria.length === 0 && <span className="text-slate-400">Sin eventos.</span>}
                  {datos.auditoria.map((a) => (
                    <span key={a.dia} className="rounded-full border border-slate-200 px-2 py-1 text-xs dark:border-slate-700">
                      {a.dia}: {a.eventos} eventos / {a.usuarios} usuarios
                    </span>
                  ))}
                </div>
                <p className="pt-2 text-xs font-semibold uppercase text-slate-500">CRM</p>
                <div className="flex flex-wrap gap-2">
                  {datos.modulos.crm.map((c) => (
                    <Badge key={c.estado} tone="info">{c.estado}: {c.leads} ({money(c.valorPonderadoCent)})</Badge>
                  ))}
                  {datos.modulos.crm.length === 0 && <span className="text-slate-400">Sin acceso o sin oportunidades.</span>}
                </div>
                <p className="pt-2 text-xs font-semibold uppercase text-slate-500">Servicios y activos</p>
                <div className="flex flex-wrap gap-2">
                  {datos.modulos.servicios.map((s) => (
                    <Badge key={s.estado} tone={s.vencidas > 0 ? 'warning' : 'neutral'}>{s.estado}: {s.ordenes} ({s.vencidas} vencidas)</Badge>
                  ))}
                  {datos.modulos.activos.slice(0, 5).map((a) => (
                    <Badge key={`${a.categoria}-${a.estado}`} tone="success">{a.categoria}: {money(a.valorNetoCent)}</Badge>
                  ))}
                  {datos.modulos.servicios.length === 0 && datos.modulos.activos.length === 0 &&
                    <span className="text-slate-400">Sin acceso o sin registros.</span>}
                </div>
              </div>
            </Card>
          </div>

          <Card title="Señales tempranas" subtitle={`Umbrales administrables: stock bajo ${datos.umbrales.stockBajo}, CxC ${datos.umbrales.cxcDias} días.`}>
            <div className="space-y-2 text-sm">
              {datos.alertas.length === 0 && <p className="text-slate-400">Sin alertas activas.</p>}
              {datos.alertas.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                  <span>{a.texto}</span>
                  <Badge tone={a.nivel === 'Alto' ? 'danger' : a.nivel === 'Medio' ? 'warning' : 'info'}>{a.nivel}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

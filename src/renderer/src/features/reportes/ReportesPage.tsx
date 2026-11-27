import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { Download, FileDown, FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { descargarArchivo } from '@/features/inventario/descargar'
import { AreaImpresionReportes } from './AreaImpresionReportes'
import {
  num, reportesDisponibles, tiposCompra, tiposVenta, txt,
  type ArchivoReporte, type DatosImpresionReporte, type DatosReporte,
  type FilaReporte, type Indicadores, type ReporteKey, type Serie
} from './types'

interface FiltroUI {
  fechaDesde: string
  fechaHasta: string
  tipo: string
  estado: string
}

const filtroVacio: FiltroUI = { fechaDesde: '', fechaHasta: '', tipo: '', estado: '' }
const estados = ['ACTIVO', 'PENDIENTE', 'CONTABILIZADO', 'PAGADO', 'ANULADO']

function payloadFiltro(filtro: FiltroUI): Record<string, unknown> {
  const payload: Record<string, unknown> = { limite: 300 }
  if (filtro.fechaDesde) payload.fechaDesde = filtro.fechaDesde
  if (filtro.fechaHasta) payload.fechaHasta = filtro.fechaHasta
  if (filtro.tipo) payload.tipo = filtro.tipo
  if (filtro.estado) payload.estado = filtro.estado
  return payload
}

function diasEntre(filtro: FiltroUI): number {
  if (!filtro.fechaDesde || !filtro.fechaHasta) return 30
  const desde = Date.parse(`${filtro.fechaDesde}T00:00:00Z`)
  const hasta = Date.parse(`${filtro.fechaHasta}T00:00:00Z`)
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return 30
  return Math.max(1, Math.round((hasta - desde) / 86_400_000) + 1)
}

export function ReportesPage(): React.JSX.Element {
  const [tab, setTab] = useState<ReporteKey>('RESUMEN')
  const [filtro, setFiltro] = useState<FiltroUI>(filtroVacio)
  const [datos, setDatos] = useState<DatosReporte | null>(null)
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [serie, setSerie] = useState<Serie | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresionReporte | null>(null)
  const [cargando, setCargando] = useState(false)
  const [procesando, setProcesando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      if (tab === 'RESUMEN') {
        const fechas: Record<string, unknown> = {}
        if (filtro.fechaDesde) fechas.fechaDesde = filtro.fechaDesde
        if (filtro.fechaHasta) fechas.fechaHasta = filtro.fechaHasta
        const [ind, puntos] = await Promise.all([
          window.api.invoke<Indicadores>('reportes.indicadores'),
          window.api.invoke<Serie>('reportes.serie', {
            ...fechas, granularidad: diasEntre(filtro) > 62 ? 'MES' : 'DIA'
          })
        ])
        setIndicadores(ind)
        setSerie(puntos)
        setDatos(null)
      } else {
        const respuesta = await window.api.invoke<DatosReporte>('reportes.consultar', {
          reporte: tab, filtro: payloadFiltro(filtro)
        })
        setDatos(respuesta)
        setIndicadores(null)
        setSerie(null)
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [tab, filtro])

  useEffect(() => { void cargar() }, [cargar])

  const columnas = useMemo<Column<FilaReporte>[]>(() => {
    if (!datos) return []
    return datos.columnas.map((columna) => ({
      key: columna.key,
      header: columna.header,
      value: (fila) => txt(fila[columna.key]),
      render: columna.key.endsWith('Cent')
        ? (fila) => <span className="font-medium tabular-nums">{money(num(fila[columna.key]))}</span>
        : undefined
    }))
  }, [datos])

  const puntosGrafica = useMemo(() => (serie?.puntos ?? []).map((punto) => ({
    clave: punto.clave,
    Ventas: punto.ventasCent / 100,
    Compras: punto.comprasCent / 100,
    Cobros: punto.cobrosCent / 100,
    Pagos: punto.pagosCent / 100
  })), [serie])

  async function exportar(format: 'XLSX' | 'CSV'): Promise<void> {
    if (tab === 'RESUMEN') return
    setProcesando(true)
    try {
      const archivo = await window.api.invoke<ArchivoReporte>('reportes.exportar', {
        reporte: tab, formato: format, filtro: payloadFiltro(filtro)
      })
      descargarArchivo(archivo.base64, archivo.filename, archivo.mime)
      toast.success(`Archivo ${format} generado correctamente.`)
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function imprimir(): Promise<void> {
    if (tab === 'RESUMEN') return
    setProcesando(true)
    try {
      const respuesta = await window.api.invoke<DatosImpresionReporte>('reportes.imprimir', {
        reporte: tab, filtro: payloadFiltro(filtro)
      })
      setImpresion(respuesta)
      if (!await imprimirDocumento('REPORTE')) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function guardarPdfReporte(): Promise<void> {
    if (tab === 'RESUMEN') return
    setProcesando(true)
    try {
      await guardarPdf({
        origen: 'reporte', reporte: tab, filtro: payloadFiltro(filtro)
      })
      toast.success('PDF del reporte descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  function cambiarTab(id: string): void {
    setTab(id as ReporteKey)
    setFiltro((actual) => ({ ...actual, tipo: '', estado: '' }))
    setImpresion(null)
  }

  const tipos = tab === 'COMPRAS' || tab === 'LIBRO606' ? tiposCompra : tiposVenta
  const muestraTipo = ['VENTAS', 'COMPRAS', 'LIBRO606', 'LIBRO607'].includes(tab)
  const muestraEstado = ['VENTAS', 'COMPRAS', 'CXC', 'CXP'].includes(tab)

  const tarjetas = indicadores ? [
    { label: 'Ventas del día', valor: money(indicadores.ventasHoyCent) },
    { label: 'Ventas del mes', valor: money(indicadores.ventasMesCent) },
    { label: 'Compras del mes', valor: money(indicadores.comprasMesCent) },
    { label: 'Cuentas por cobrar', valor: money(indicadores.cxcSaldoCent) },
    { label: 'Cuentas por pagar', valor: money(indicadores.cxpSaldoCent) },
    { label: 'Productos agotados', valor: String(indicadores.productosAgotados) },
    {
      label: 'Ganancia del mes',
      valor: indicadores.gananciaMesCent === null ? 'Sin permiso' : money(indicadores.gananciaMesCent)
    },
    {
      label: 'Caja abierta',
      valor: indicadores.cajaAbierta
        ? money(indicadores.cajaAbierta.fondoCent)
        : 'Sin sesión abierta'
    }
  ] : []

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reportes"
        subtitle="Totales reconcilian con documentos reales de SQLite. Libros 606/607 en formato borrador local, sin certificación DGII."
      />

      <Tabs
        tabs={reportesDisponibles.map((reporte) => ({ id: reporte.id, label: reporte.label }))}
        active={tab}
        onChange={cambiarTab}
      />

      <Card
        title="Filtros"
        subtitle="Aplique períodos y tipos antes de exportar o imprimir."
        className="mb-4"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
            {tab !== 'RESUMEN' && can('reportes.exportar') && (
              <>
                <Button variant="secondary" size="sm" onClick={() => void exportar('XLSX')} disabled={procesando}>
                  <FileSpreadsheet size={14} /> Excel
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void exportar('CSV')} disabled={procesando}>
                  <FileText size={14} /> CSV
                </Button>
              </>
            )}
            {tab !== 'RESUMEN' && can('reportes.imprimir') && (
              <>
                <Button variant="secondary" size="sm" onClick={() => void imprimir()} disabled={procesando}>
                  <Printer size={14} /> Imprimir
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void guardarPdfReporte()} disabled={procesando}>
                  <FileDown size={14} /> PDF
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Desde">
            <TextInput type="date" value={filtro.fechaDesde}
              onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <TextInput type="date" value={filtro.fechaHasta}
              onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value })} />
          </Field>
          {muestraTipo && (
            <Field label="Tipo de documento">
              <select className={inputClass} value={filtro.tipo}
                onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
                <option value="">Todos</option>
                {tipos.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </Field>
          )}
          {muestraEstado && (
            <Field label="Estado">
              <select className={inputClass} value={filtro.estado}
                onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
                <option value="">Todos</option>
                {estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
              </select>
            </Field>
          )}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Download size={13} />
          {tab === 'RESUMEN'
            ? 'El resumen se calcula en el servidor con SQL sobre las tablas del ERP.'
            : `${datos?.registros ?? 0} registro(s) en la consulta actual.`}
        </p>
      </Card>

      {cargando && (
        <p className="mb-4 text-sm text-slate-400">Consultando datos reales…</p>
      )}

      {tab === 'RESUMEN' ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tarjetas.map((tarjeta) => (
              <div key={tarjeta.label}
                className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">{tarjeta.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{tarjeta.valor}</p>
              </div>
            ))}
          </div>

          <Card
            title="Evolución del período"
            subtitle={serie ? `${serie.desde} al ${serie.hasta} · granularidad ${serie.granularidad === 'MES' ? 'mensual' : 'diaria'}` : ''}
          >
            {puntosGrafica.length > 0 ? (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={puntosGrafica} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="clave" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={72} />
                    <Tooltip formatter={(valor, nombre) => [money(num(valor) * 100), String(nombre)]} />
                    <Legend />
                    <Area type="monotone" dataKey="Ventas" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.14} />
                    <Area type="monotone" dataKey="Compras" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} />
                    <Area type="monotone" dataKey="Cobros" stroke="#10b981" fill="#10b981" fillOpacity={0.12} />
                    <Area type="monotone" dataKey="Pagos" stroke="#ef4444" fill="#ef4444" fillOpacity={0.10} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">
                No hay movimientos en el período seleccionado.
              </p>
            )}
          </Card>
        </>
      ) : datos ? (
        <>
          <Card title="Totales del reporte" subtitle={datos.titulo} className="mb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Registros</p>
                <p className="mt-1 text-lg font-semibold">{datos.registros}</p>
              </div>
              {Object.entries(datos.totales).map(([clave, valor]) => (
                <div key={clave} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {clave.replace(/([a-z])([A-Z])/g, '$1 $2')}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{money(valor)}</p>
                </div>
              ))}
            </div>
            {(tab === 'LIBRO606' || tab === 'LIBRO607') && (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                Borrador local preparado para e-CF; no constituye certificación DGII.
              </p>
            )}
          </Card>

          <Card title={datos.titulo} subtitle="Datos consultados en este momento.">
            <DataTable
              columns={columnas}
              data={datos.filas}
              rowKey={(fila) => [
                txt(fila.numero ?? fila.numeroDocumento ?? fila.codigo ?? fila.fecha ?? ''),
                txt(fila.rnc ?? fila.tipo ?? ''),
                txt(fila.totalCent ?? fila.saldoCent ?? '')
              ].join('-')}
              pageSize={12}
              emptyText="No hay documentos que coincidan con los filtros."
              searchPlaceholder="Buscar en el reporte…"
            />
          </Card>
        </>
      ) : !cargando ? (
        <Card title="Sin datos" subtitle="No se pudo cargar el reporte; revise los filtros e intente de nuevo.">
          <p className="text-sm text-slate-400">Seleccione un reporte y aplique los filtros deseados.</p>
        </Card>
      ) : null}

      <AreaImpresionReportes datos={impresion} />
    </div>
  )
}

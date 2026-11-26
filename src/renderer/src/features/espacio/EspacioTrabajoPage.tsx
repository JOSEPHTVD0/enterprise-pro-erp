import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { Download, FileText, Play, Printer, RefreshCw, Save, Trash2 } from 'lucide-react'
import type { Settings } from '@shared/settings'
import { defaultAjustes, type Ajustes } from '@shared/schemas/ajustes'
import type { EspacioComprobantesFiltro, EspacioFiltro } from '@shared/schemas/espacio'
import { can, errorInfo, useSessionStore } from '@/app/session'
import { useAppStore } from '@/app/store'
import { useAjustesStore } from '@/app/ajustes-store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { descargarArchivo } from '@/features/inventario/descargar'
import type { ConfigData } from '@/features/configuracion/types'
import { confirmarAccion, money, number } from '@/lib/format'

type Fila = Record<string, unknown>

interface Kpis {
  ventasCent: number
  comprasCent: number
  cobrosCent: number
  pagosCent: number
  cxcSaldoCent: number
  cxpSaldoCent: number
  documentosVenta: number
  documentosCompra: number
  ticketPromedioCent: number
  utilidadCent: number | null
}

interface Resumen {
  filtro: EspacioFiltro & { desde: string; hasta: string; granularidad: string }
  kpis: Kpis
  serie: { clave: string; ventasCent: number; comprasCent: number }[]
  detalle: {
    topProductos?: { nombre: string; totalCent: number; unidades: number }[]
    topProveedores?: { nombre: string; totalCent: number; documentos: number }[]
    stockBajo?: Fila[]
    vencimientos?: Fila[]
  }
}

interface Comprobante {
  id: number
  origen: 'venta' | 'compra'
  tipo: string
  numero: string
  numeroFactura: string
  fecha: string
  vencimiento: string
  estado: string
  condicion: string
  entidad: string
  entidadRnc: string
  totalCent: number
  impuestoCent: number
  monedaCodigo: string
  tasaAplicada: number
}

interface Diagnostico {
  calculadoEn: string
  calificacion: 'ok' | 'advertencia' | 'error'
  comprobaciones: { nombre: string; estado: 'ok' | 'advertencia' | 'error'; detalle: string }[]
  base: Record<string, number>
  datos: Record<string, number>
  ultimaAuditoria: Fila | null
}

interface Plantilla {
  id: number
  nombre: string
  descripcion: string
  settings: Partial<Settings>
  ajustes: Partial<Ajustes>
  creadoEn: string
  actualizadoEn: string
}

const filtroInicial: EspacioFiltro = {
  vista: 'GENERAL', periodo: 'ANIO', fechaDesde: '', fechaHasta: ''
}
const filtroComprobantesInicial: EspacioComprobantesFiltro = {
  origen: 'venta', tipo: '', estado: '', texto: '', fechaDesde: '', fechaHasta: '', limite: 30
}

function Kpi({ titulo, valor, tono = 'neutral' }: {
  titulo: string; valor: string; tono?: 'neutral' | 'success' | 'warning' | 'info'
}): ReactNode {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{valor}</p>
      <Badge tone={tono}>{titulo}</Badge>
    </div>
  )
}

function descargarTexto(contenido: string, nombre: string): void {
  const bytes = new TextEncoder().encode(contenido)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function PanelTab(): ReactNode {
  const [filtro, setFiltro] = useState<EspacioFiltro>(filtroInicial)
  const [datos, setDatos] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(false)
  const ctx = useSessionStore((s) => s.ctx)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      setDatos(await window.api.invoke<Resumen>('espacio.resumen', filtro))
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [filtro])

  useEffect(() => { void cargar() }, [cargar])

  const exportar = (): void => {
    if (!datos) return
    const lineas = [
      'Período,Desde,Hasta,Ventas,Compras,Cobros,Pagos,CxC,CxP',
      [
        datos.filtro.periodo, datos.filtro.desde, datos.filtro.hasta,
        datos.kpis.ventasCent / 100, datos.kpis.comprasCent / 100,
        datos.kpis.cobrosCent / 100, datos.kpis.pagosCent / 100,
        datos.kpis.cxcSaldoCent / 100, datos.kpis.cxpSaldoCent / 100
      ].map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(','),
      '', 'Fecha/Clave,Ventas,Compras',
      ...datos.serie.map((fila) => `"${fila.clave}",${fila.ventasCent / 100},${fila.comprasCent / 100}`)
    ]
    descargarTexto(`\uFEFF${lineas.join('\r\n')}`, `espacio-panel-${datos.filtro.hasta}.csv`)
  }

  const kpis = datos?.kpis
  return (
    <TabPanel>
      <Card
        title="Visualización de la operación"
        subtitle="Cifras calculadas desde documentos, cobros, pagos e inventario de la empresa."
        actions={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
            {can('espacio.exportar') && (
              <Button variant="secondary" size="sm" onClick={exportar} disabled={!datos}>
                <Download size={14} /> CSV
              </Button>
            )}
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Vista">
            <select
              className={inputClass}
              value={filtro.vista}
              onChange={(e) => setFiltro({ ...filtro, vista: e.target.value as EspacioFiltro['vista'] })}
            >
              <option value="GENERAL">General</option>
              <option value="VENTAS">Ventas</option>
              <option value="COMPRAS">Compras</option>
              <option value="INVENTARIO">Inventario</option>
              <option value="FINANZAS">Finanzas</option>
            </select>
          </Field>
          <Field label="Período">
            <select
              className={inputClass}
              value={filtro.periodo}
              onChange={(e) => setFiltro({ ...filtro, periodo: e.target.value as EspacioFiltro['periodo'] })}
            >
              <option value="MES">Mes actual</option>
              <option value="TRIMESTRE">Últimos tres meses</option>
              <option value="ANIO">Año actual</option>
              <option value="PERSONALIZADO">Personalizado</option>
            </select>
          </Field>
          {filtro.periodo === 'PERSONALIZADO' && (
            <>
              <Field label="Desde">
                <TextInput type="date" value={filtro.fechaDesde}
                  onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value })} />
              </Field>
              <Field label="Hasta">
                <TextInput type="date" value={filtro.fechaHasta}
                  onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value })} />
              </Field>
            </>
          )}
        </div>
      </Card>

      {kpis && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi titulo="Ventas netas" valor={money(kpis.ventasCent)} tono="success" />
          <Kpi titulo="Compras netas" valor={money(kpis.comprasCent)} />
          <Kpi titulo="Cobros del período" valor={money(kpis.cobrosCent)} tono="info" />
          <Kpi titulo="Pagos del período" valor={money(kpis.pagosCent)} />
          <Kpi titulo="Saldo CxC" valor={money(kpis.cxcSaldoCent)} tono="warning" />
          <Kpi titulo="Saldo CxP" valor={money(kpis.cxpSaldoCent)} tono="warning" />
          <Kpi titulo="Ticket promedio" valor={money(kpis.ticketPromedioCent)} />
          <Kpi
            titulo="Utilidad"
            valor={kpis.utilidadCent === null ? 'Sin permiso' : money(kpis.utilidadCent)}
            tono={kpis.utilidadCent === null ? 'neutral' : 'success'}
          />
        </div>
      )}

      {datos && datos.serie.length > 0 && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card title="Tendencia" subtitle={`Agrupado por ${datos.filtro.granularidad === 'DIA' ? 'día' : 'mes'}.`}>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={datos.serie} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="clave" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(valor) => money(Number(valor))} />
                  <Legend />
                  <Area type="monotone" dataKey="ventasCent" name="Ventas" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.16} />
                  <Area type="monotone" dataKey="comprasCent" name="Compras" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.14} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Detalle según la vista" subtitle="Listados reales limitados a los primeros resultados.">
            <div className="space-y-4">
              {datos.detalle.topProductos && datos.detalle.topProductos.length > 0 && (
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datos.detalle.topProductos} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(valor) => money(Number(valor))} />
                      <Bar dataKey="totalCent" name="Ventas">
                        {datos.detalle.topProductos.map((_, i) => (
                          <Cell key={i} fill="#4f46e5" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {datos.detalle.topProveedores && (
                <DataTable
                  columns={[
                    { key: 'nombre', header: 'Proveedor', value: (f) => f.nombre },
                    { key: 'documentos', header: 'Docs', value: (f) => f.documentos },
                    { key: 'totalCent', header: 'Total', value: (f) => money(f.totalCent) }
                  ]}
                  data={datos.detalle.topProveedores}
                  rowKey={(f) => f.nombre}
                  storageKey="espacio-top-proveedores"
                  emptyText="Sin compras en el período."
                />
              )}
              {datos.detalle.stockBajo && (
                <DataTable
                  columns={[
                    { key: 'codigo', header: 'Código', value: (f) => String(f.codigo ?? '') },
                    { key: 'descripcion', header: 'Producto', value: (f) => String(f.descripcion ?? '') },
                    { key: 'cantidad', header: 'Existencia', value: (f) => number(f.cantidad) },
                    { key: 'valorCent', header: 'Valor', value: (f) => money(Number(f.valorCent)) }
                  ]}
                  data={datos.detalle.stockBajo}
                  rowKey={(f) => String(f.id ?? f.codigo ?? Math.random())}
                  storageKey="espacio-stock-bajo"
                  emptyText="Sin productos por debajo del umbral."
                />
              )}
              {datos.detalle.vencimientos && (
                <DataTable
                  columns={[
                    { key: 'origen', header: 'Origen', value: (f) => String(f.origen ?? '') },
                    { key: 'entidad', header: 'Entidad', value: (f) => String(f.entidad ?? '') },
                    { key: 'numero', header: 'Número', value: (f) => String(f.numero ?? '') },
                    { key: 'vencimiento', header: 'Vence', value: (f) => String(f.vencimiento ?? '') },
                    { key: 'saldoCent', header: 'Saldo', value: (f) => money(Number(f.saldoCent)) }
                  ]}
                  data={datos.detalle.vencimientos}
                  rowKey={(f) => `${String(f.origen)}-${String(f.numero)}-${String(f.vencimiento ?? '')}`}
                  storageKey="espacio-vencimientos"
                  emptyText="Sin saldos vencidos."
                />
              )}
            </div>
          </Card>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">
        Período efectivo: {datos ? `${datos.filtro.desde} al ${datos.filtro.hasta}` : '—'}
        {' · '}Usuario: {ctx?.nombre ?? '—'}
      </p>
    </TabPanel>
  )
}

function ComprobantesTab(): ReactNode {
  const [filtro, setFiltro] = useState<EspacioComprobantesFiltro>(filtroComprobantesInicial)
  const [filas, setFilas] = useState<Comprobante[]>([])
  const [emitidos, setEmitidos] = useState<Fila[]>([])
  const [formato, setFormato] = useState('CARTA')
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      const respuesta = await window.api.invoke<{ filas: Comprobante[] }>('espacio.comprobantes', filtro)
      setFilas(respuesta.filas)
      const historial = await window.api.invoke<{ emisiones: Fila[] }>('espacio.emisiones.list')
      setEmitidos(historial.emisiones)
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [filtro])

  useEffect(() => { void cargar() }, [cargar])

  const emitir = async (fila: Comprobante): Promise<void> => {
    try {
      const archivo = await window.api.invoke<{ filename: string; base64: string; mime: string }>(
        'espacio.comprobante.emitir',
        { origen: fila.origen, id: fila.id, formato, motivo: 'Reimpresión desde Espacio de trabajo' }
      )
      descargarArchivo(archivo.base64, archivo.filename, archivo.mime)
      toast.success('Comprobante generado y registrado en el historial.')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const exportar = async (): Promise<void> => {
    try {
      const archivo = await window.api.invoke<{ filename: string; base64: string; mime: string }>(
        'espacio.comprobantes.exportar', filtro
      )
      descargarArchivo(archivo.base64, archivo.filename, archivo.mime)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnas: Column<Comprobante>[] = [
    { key: 'origen', header: 'Origen', value: (f) => f.origen === 'venta' ? 'Venta' : 'Compra' },
    { key: 'tipo', header: 'Tipo', value: (f) => f.tipo.replaceAll('_', ' ') },
    { key: 'numero', header: 'Número/NCF', value: (f) => f.numero },
    { key: 'numeroFactura', header: 'Factura proveedor', value: (f) => f.numeroFactura || '—' },
    { key: 'fecha', header: 'Fecha', value: (f) => f.fecha },
    { key: 'entidad', header: 'Cliente/Proveedor', value: (f) => f.entidad },
    { key: 'estado', header: 'Estado', value: (f) => f.estado },
    { key: 'totalCent', header: 'Total', value: (f) => money(f.totalCent) },
    { key: 'monedaCodigo', header: 'Moneda', value: (f) => `${f.monedaCodigo} ${number(f.tasaAplicada)}` }
  ]

  return (
    <TabPanel>
      <Card
        title="Comprobantes reales"
        subtitle="Se emiten desde documentos existentes; el PDF y su auditoría los genera el backend."
        actions={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
            {can('espacio.exportar') && (
              <Button variant="secondary" size="sm" onClick={() => void exportar()}>
                <Download size={14} /> Exportar
              </Button>
            )}
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Origen">
            <select className={inputClass} value={filtro.origen}
              onChange={(e) => setFiltro({ ...filtro, origen: e.target.value as 'venta' | 'compra' })}>
              <option value="venta">Ventas</option>
              <option value="compra">Compras</option>
            </select>
          </Field>
          <Field label="Buscar">
            <TextInput value={filtro.texto} placeholder="Número, entidad o RNC"
              onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
          </Field>
          <Field label="Desde">
            <TextInput type="date" value={filtro.fechaDesde}
              onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <TextInput type="date" value={filtro.fechaHasta}
              onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value })} />
          </Field>
          <Field label="Formato de impresión">
            <select className={inputClass} value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="CARTA">Carta</option>
              <option value="MEDIA">Media carta</option>
              <option value="TICKET_80">Ticket 80 mm</option>
              <option value="TICKET_58">Ticket 58 mm</option>
            </select>
          </Field>
        </div>
      </Card>

      <div className="mt-4">
        <Card title="Documentos disponibles">
          <DataTable
            columns={columnas}
            data={filas}
            rowKey={(f) => `${f.origen}-${f.id}`}
            storageKey="espacio-comprobantes"
            searchPlaceholder="Filtrar resultados…"
            emptyText="No hay documentos que coincidan con el filtro."
            actions={(f) => can('espacio.imprimir') &&
              can(f.origen === 'venta' ? 'ventas.imprimir' : 'compras.imprimir') ? (
              <Button variant="ghost" size="sm" title={`Emitir ${f.numero}`} onClick={() => void emitir(f)}>
                <Printer size={14} />
              </Button>
            ) : null}
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Historial de comprobantes emitidos" subtitle="Registro central, independiente del historial de compras.">
          <DataTable
            columns={[
              { key: 'id', header: '#', value: (f) => Number(f.id ?? 0) },
              { key: 'creadoEn', header: 'Fecha', value: (f) => String(f.creadoEn ?? '') },
              { key: 'origen', header: 'Origen', value: (f) => String(f.origen ?? '') },
              { key: 'numero', header: 'Número', value: (f) => String(f.numero ?? '') },
              { key: 'formato', header: 'Formato', value: (f) => String(f.formato ?? '') },
              { key: 'motivo', header: 'Motivo', value: (f) => String(f.motivo ?? '') }
            ]}
            data={emitidos}
            rowKey={(f) => Number(f.id ?? 0)}
            storageKey="espacio-emisiones"
            emptyText="Todavía no se han emitido comprobantes desde este espacio."
          />
        </Card>
      </div>
    </TabPanel>
  )
}

function ParametrosTab(): ReactNode {
  const [cfg, setCfg] = useState<ConfigData | null>(null)
  const [clave, setClave] = useState('')
  const [valor, setValor] = useState('')
  const [cargando, setCargando] = useState(false)
  const puedeModificar = can('configuracion.parametros.modificar')

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      setCfg(await window.api.invoke<ConfigData>('config.get'))
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const guardar = async (): Promise<void> => {
    if (!clave.trim()) {
      toast.warning('Escriba la clave del parámetro.')
      return
    }
    try {
      await window.api.invoke('config.parametro.set', { clave: clave.trim(), valor })
      toast.success('Parámetro guardado y auditado.')
      setClave('')
      setValor('')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const parametros = Object.entries(cfg?.parametros ?? {})
    .filter(([key]) => can('configuracion.respaldo.crear') || !key.startsWith('backup_'))
    .map(([key, texto]) => ({ clave: key, valor: texto }))

  return (
    <TabPanel>
      <Card
        title="Parámetros de la empresa"
        subtitle="Valores vigentes leídos de configuración; cada cambio queda en auditoría."
        actions={(
          <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </Button>
        )}
      >
        {puedeModificar && (
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Field label="Clave">
              <TextInput value={clave} placeholder="Ej. empresa_monedas" onChange={(e) => setClave(e.target.value)} />
            </Field>
            <Field label="Valor">
              <TextInput value={valor} placeholder="Texto, número o JSON" onChange={(e) => setValor(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button onClick={() => void guardar()}><Save size={14} /> Guardar</Button>
            </div>
          </div>
        )}
        <DataTable
          columns={[
            { key: 'clave', header: 'Clave', value: (f) => f.clave },
            { key: 'valor', header: 'Valor vigente', value: (f) => f.valor }
          ]}
          data={parametros}
          rowKey={(f) => f.clave}
          storageKey="espacio-parametros"
          searchPlaceholder="Buscar parámetro…"
          emptyText="No hay parámetros registrados para esta empresa."
          actions={(f) => puedeModificar ? (
            <Button variant="ghost" size="sm" title="Editar parámetro"
              onClick={() => { setClave(f.clave); setValor(f.valor) }}>
              <FileText size={14} />
            </Button>
          ) : null}
        />
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi titulo="Impuestos" valor={number(cfg?.impuestos.length ?? 0)} />
        <Kpi titulo="Monedas" valor={number(cfg?.monedas.length ?? 0)} />
        <Kpi titulo="Tasas registradas" valor={number(cfg?.tasas.length ?? 0)} />
        <Kpi titulo="Series" valor={number(cfg?.series.length ?? 0)} />
        <Kpi titulo="Almacenes" valor={number(cfg?.almacenes.length ?? 0)} />
        <Kpi titulo="Cajas e impresoras" valor={number((cfg?.cajas.length ?? 0) + (cfg?.impresoras.length ?? 0))} />
      </div>
    </TabPanel>
  )
}

function HerramientasTab(): ReactNode {
  const [datos, setDatos] = useState<Diagnostico | null>(null)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      setDatos(await window.api.invoke<Diagnostico>('espacio.diagnostico'))
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const reindexar = async (): Promise<void> => {
    if (!confirmarAccion('¿Reconstruir los índices de la base de datos? La operación queda auditada.')) return
    try {
      const resultado = await window.api.invoke<{ ok: boolean }>('espacio.reindex', { confirmacion: 'REINDEX' })
      if (resultado.ok) {
        toast.success('Índices reconstruidos correctamente.')
        await cargar()
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const informe = (): void => {
    if (!datos) return
    const lineas = [
      'ESPACIO DE TRABAJO — DIAGNÓSTICO',
      `Generado: ${datos.calculadoEn}`,
      `Calificación: ${datos.calificacion}`,
      '',
      ...datos.comprobaciones.map((c) => `[${c.estado.toUpperCase()}] ${c.nombre}: ${c.detalle}`),
      '',
      `Páginas: ${datos.base.paginas} (libres ${datos.base.paginasLibres})`,
      `Migraciones: ${datos.base.ultimaMigracion} de ${datos.base.migraciones}`,
      `Documentos de venta: ${datos.datos.documentosVenta}`,
      `Documentos de compra: ${datos.datos.documentosCompra}`,
      `Comprobantes emitidos: ${datos.datos.comprobantesEmitidos}`
    ]
    descargarTexto(lineas.join('\r\n'), `espacio-diagnostico-${datos.calculadoEn.slice(0, 10)}.txt`)
  }

  return (
    <TabPanel>
      <Card
        title="Herramientas de mantenimiento"
        subtitle="Comprobaciones reales sobre la base activa. Ninguna acción modifica datos de negocio."
        actions={(
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Verificar
            </Button>
            <Button variant="secondary" size="sm" onClick={informe} disabled={!datos}>
              <Download size={14} /> Informe
            </Button>
            {can('espacio.mantenimiento') && (
              <Button size="sm" onClick={() => void reindexar()}>
                <Play size={14} /> Reconstruir índices
              </Button>
            )}
          </div>
        )}
      >
        {datos && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Badge tone={datos.calificacion === 'ok' ? 'success' : datos.calificacion === 'error' ? 'danger' : 'warning'}>
                {datos.calificacion}
              </Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Actualizado {new Date(datos.calculadoEn).toLocaleString('es-DO')}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {datos.comprobaciones.map((c) => (
                <div key={c.nombre} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{c.nombre}</p>
                    <Badge tone={c.estado === 'ok' ? 'success' : c.estado === 'error' ? 'danger' : 'warning'}>{c.estado}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.detalle}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Kpi titulo="Páginas" valor={number(datos.base.paginas)} />
              <Kpi titulo="Páginas libres" valor={number(datos.base.paginasLibres)} />
              <Kpi titulo="Migraciones" valor={number(datos.base.migraciones)} />
              <Kpi titulo="Productos" valor={number(datos.datos.productos)} />
              <Kpi titulo="Clientes" valor={number(datos.datos.clientes)} />
              <Kpi titulo="Plantillas" valor={number(datos.datos.plantillas)} />
            </div>
            {datos.ultimaAuditoria && (
              <p className="mt-3 text-[11px] text-slate-400">
                Última auditoría: {String(datos.ultimaAuditoria.operacion ?? '')} ·
                {' '}{String(datos.ultimaAuditoria.entidad ?? '')} ·
                {' '}{String(datos.ultimaAuditoria.fecha ?? '')}
              </p>
            )}
          </>
        )}
      </Card>
    </TabPanel>
  )
}

function PersonalizacionTab(): ReactNode {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const ajustes = useAjustesStore((s) => s.ajustes)
  const recargarAjustes = useAjustesStore((s) => s.recargar)
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [modal, setModal] = useState<Plantilla | null>(null)
  const puedeAjustes = can('configuracion.ajustes.modificar') && can('configuracion.ajustes.interfaz.modificar')
  const puedePlantillas = can('espacio.modificar')

  const cargar = useCallback(async (): Promise<void> => {
    try {
      const respuesta = await window.api.invoke<{ plantillas: Plantilla[] }>('espacio.presets.list')
      setPlantillas(respuesta.plantillas)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const notificar = (): void => {
    window.dispatchEvent(new Event('erp:preferencias-actualizadas'))
  }

  const guardarEstacion = async (cambios: Partial<Settings>): Promise<void> => {
    try {
      await setSettings({ ...settings, ...cambios })
      notificar()
      toast.success('Preferencias de estación guardadas.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const guardarInterfaz = async (cambios: Partial<Ajustes['interfaz']>): Promise<void> => {
    if (!puedeAjustes) {
      toast.error('Su perfil no puede modificar la interfaz de la empresa.')
      return
    }
    try {
      await window.api.invoke('config.ajustes.save', {
        grupo: 'interfaz',
        datos: { ...(ajustes.interfaz ?? defaultAjustes.interfaz), ...cambios }
      })
      await recargarAjustes()
      notificar()
      toast.success('Interfaz de la empresa actualizada.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const guardarPlantilla = async (): Promise<void> => {
    if (!puedePlantillas) {
      toast.error('Su perfil no puede guardar plantillas.')
      return
    }
    if (nombre.trim().length < 2) {
      toast.warning('Escriba un nombre de al menos dos caracteres.')
      return
    }
    try {
      await window.api.invoke('espacio.presets.save', {
        nombre: nombre.trim(), descripcion: descripcion.trim(),
        settings: useAppStore.getState().settings,
        ajustes: {
          tema: ajustes.tema ?? defaultAjustes.tema,
          interfaz: ajustes.interfaz ?? defaultAjustes.interfaz,
          widgets: ajustes.widgets ?? defaultAjustes.widgets,
          panel2026: ajustes.panel2026 ?? defaultAjustes.panel2026
        }
      })
      setNombre('')
      setDescripcion('')
      toast.success('Plantilla guardada con la configuración actual.')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const aplicarPlantilla = async (plantilla: Plantilla): Promise<void> => {
    if (!puedePlantillas || !puedeAjustes) {
      toast.error('Se requieren permisos de plantillas y de ajustes para aplicarla.')
      return
    }
    try {
      for (const [grupo, datos] of Object.entries(plantilla.ajustes ?? {})) {
        if (datos && typeof datos === 'object') {
          await window.api.invoke('config.ajustes.save', { grupo, datos })
        }
      }
      const guardadas = await window.api.settings.set(plantilla.settings as Settings)
      useAppStore.getState().hydrate(guardadas)
      await recargarAjustes()
      notificar()
      setModal(null)
      toast.success(`Plantilla «${plantilla.nombre}» aplicada.`)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const eliminarPlantilla = async (plantilla: Plantilla): Promise<void> => {
    if (!confirmarAccion(`¿Eliminar la plantilla «${plantilla.nombre}»?`)) return
    try {
      await window.api.invoke('espacio.presets.delete', { id: plantilla.id })
      toast.success('Plantilla eliminada.')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const interfaz = ajustes.interfaz ?? defaultAjustes.interfaz
  return (
    <TabPanel>
      <Card
        title="Personalización de la estación"
        subtitle="Preferencias guardadas en disco y ajustes de empresa validados en backend."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Tema">
            <select className={inputClass} value={settings.theme}
              onChange={(e) => void guardarEstacion({ theme: e.target.value as Settings['theme'] })}>
              <option value="system">Según el sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </Field>
          <Field label="Densidad de la estación">
            <select className={inputClass} value={settings.interfaz.densidad}
              onChange={(e) => void guardarEstacion({
                interfaz: { ...settings.interfaz, densidad: e.target.value as Settings['interfaz']['densidad'] }
              })}>
              <option value="compacta">Compacta</option>
              <option value="normal">Normal</option>
              <option value="amplia">Amplia</option>
            </select>
          </Field>
          <Field label="Tamaño de fuente">
            <select className={inputClass} value={settings.interfaz.tamanoFuente}
              onChange={(e) => void guardarEstacion({
                interfaz: { ...settings.interfaz, tamanoFuente: Number(e.target.value) }
              })}>
              {[12, 13, 14, 15, 16, 18, 20].map((tamano) => (
                <option key={tamano} value={tamano}>{tamano} px</option>
              ))}
            </select>
          </Field>
          <Field label="Filas por página">
            <select className={inputClass} value={settings.interfaz.paginaTamano}
              onChange={(e) => void guardarEstacion({
                interfaz: { ...settings.interfaz, paginaTamano: Number(e.target.value) }
              })}>
              {[5, 10, 15, 20, 30, 50].map((tamano) => (
                <option key={tamano} value={tamano}>{tamano}</option>
              ))}
            </select>
          </Field>
          <Field label="Título de la aplicación" hint="Se guarda en los ajustes de interfaz de la empresa.">
            <TextInput
              key={`titulo-${interfaz.tituloApp}`}
              defaultValue={interfaz.tituloApp}
              onBlur={(e) => void guardarInterfaz({ tituloApp: e.target.value })}
            />
          </Field>
          <Field label="Ancho del menú (px)">
            <TextInput
              key={`ancho-${interfaz.anchoSidebar}`}
              type="number"
              defaultValue={interfaz.anchoSidebar}
              onBlur={(e) => void guardarInterfaz({ anchoSidebar: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ['Confirmar acciones', settings.interfaz.confirmarAcciones,
              (v: boolean) => void guardarEstacion({ interfaz: { ...settings.interfaz, confirmarAcciones: v } })],
            ['Animaciones', settings.interfaz.animaciones,
              (v: boolean) => void guardarEstacion({ interfaz: { ...settings.interfaz, animaciones: v } })],
            ['Tooltips', settings.interfaz.tooltips,
              (v: boolean) => void guardarEstacion({ interfaz: { ...settings.interfaz, tooltips: v } })],
            ['Menú plegado', settings.sidebarCollapsed,
              (v: boolean) => void guardarEstacion({ sidebarCollapsed: v })]
          ] as [string, boolean, (valor: boolean) => void][]).map(([etiqueta, valor, cambiar]) => (
            <label key={etiqueta} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={Boolean(valor)}
                onChange={(e) => cambiar(e.target.checked)} />
              {etiqueta}
            </label>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Guardar plantilla actual" subtitle="Captura preferencias reales de estación y ajustes de empresa.">
          {puedePlantillas ? (
            <div className="space-y-3">
              <Field label="Nombre">
                <TextInput value={nombre} placeholder="Ej. Mostrador rápido" onChange={(e) => setNombre(e.target.value)} />
              </Field>
              <Field label="Descripción">
                <TextInput value={descripcion} placeholder="Para qué sirve esta combinación" onChange={(e) => setDescripcion(e.target.value)} />
              </Field>
              <Button onClick={() => void guardarPlantilla()}><Save size={14} /> Guardar plantilla</Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Su perfil no tiene permiso para guardar plantillas.</p>
          )}
        </Card>
        <Card title="Plantillas guardadas" subtitle="Se aplican con los mismos canales auditados del centro de control.">
          <DataTable
            columns={[
              { key: 'nombre', header: 'Nombre', value: (f) => f.nombre },
              { key: 'descripcion', header: 'Descripción', value: (f) => f.descripcion || '—' },
              { key: 'actualizadoEn', header: 'Actualizada', value: (f) => String(f.actualizadoEn ?? '') }
            ]}
            data={plantillas}
            rowKey={(f) => f.id}
            storageKey="espacio-plantillas"
            emptyText="Todavía no hay plantillas guardadas."
            actions={(f) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" title="Aplicar plantilla" onClick={() => setModal(f)}>
                  <Play size={14} />
                </Button>
                {puedePlantillas && (
                  <Button variant="ghost" size="sm" title="Eliminar plantilla" onClick={() => void eliminarPlantilla(f)}>
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            )}
          />
        </Card>
      </div>

      <Modal
        open={Boolean(modal)}
        title={`Aplicar «${modal?.nombre ?? ''}»`}
        subtitle="Se conservarán los permisos actuales; solo cambian preferencias y ajustes visuales."
        onClose={() => setModal(null)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={() => { if (modal) void aplicarPlantilla(modal) }}>Aplicar</Button>
          </div>
        )}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{modal?.descripcion || 'Sin descripción.'}</p>
      </Modal>
    </TabPanel>
  )
}

export function EspacioTrabajoPage(): ReactNode {
  const [tab, setTab] = useState('panel')
  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title="Espacio de trabajo"
        subtitle="Panel, comprobantes, parámetros, herramientas y personalización sobre datos reales."
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'panel', label: 'Panel' },
          { id: 'comprobantes', label: 'Comprobantes' },
          { id: 'parametros', label: 'Parámetros' },
          { id: 'herramientas', label: 'Herramientas' },
          { id: 'personalizacion', label: 'Personalización' }
        ]}
      />
      {tab === 'panel' && <PanelTab />}
      {tab === 'comprobantes' && <ComprobantesTab />}
      {tab === 'parametros' && <ParametrosTab />}
      {tab === 'herramientas' && <HerramientasTab />}
      {tab === 'personalizacion' && <PersonalizacionTab />}
    </div>
  )
}

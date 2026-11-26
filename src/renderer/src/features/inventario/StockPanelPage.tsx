import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, Plus } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { useAppStore } from '@/app/store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money, nivelVisible, number, titleSi, usePreferenciasInterfaz } from '@/lib/format'
import { coincideTexto } from '@shared/texto'
import { descargarArchivo } from './descargar'
import { MovimientoModal } from './MovimientoModal'
import type { AlmacenOp, FilaInventario, ProductoOp } from './types'

type Fila = Record<string, unknown>

interface Costos {
  productoId: number
  nombre: string
  historial: Fila[]
  movimientos: Fila[]
}

const txt = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor))
const num = (valor: unknown): number => Number(valor ?? 0) || 0

export function StockPanelPage(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<AlmacenOp[]>([])
  const [productos, setProductos] = useState<ProductoOp[]>([])
  const [filas, setFilas] = useState<FilaInventario[]>([])
  const [kardex, setKardex] = useState<Fila[]>([])
  const [transferencias, setTransferencias] = useState<Fila[]>([])
  const [ajustes, setAjustes] = useState<Fila[]>([])
  const [almacenId, setAlmacenId] = useState('')
  const [soloMinimos, setSoloMinimos] = useState(false)
  const [texto, setTexto] = useState('')
  const [tab, setTab] = useState('existencias')
  const [movimiento, setMovimiento] = useState(false)
  const [costos, setCostos] = useState<Costos | null>(null)
  const [exportando, setExportando] = useState(false)
  const preferencias = usePreferenciasInterfaz()
  const umbral = preferencias.alertas.stockBajoUmbral
  const puedeCrear = can('inventario.crear')
  const puedeExportar = can('inventario.exportar')
  const puedeCosto = can('inventario.costo')

  useEffect(() => {
    void window.api.invoke<{ almacenes: AlmacenOp[]; productos: ProductoOp[] }>('inventario.catalogos')
      .then((res) => { setAlmacenes(res.almacenes ?? []); setProductos(res.productos ?? []) })
      .catch((e) => toast.error(errorInfo(e).message))
  }, [])

  const filtro = useMemo(() => ({
    ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    ...(soloMinimos ? { soloMinimos: true } : {})
  }), [almacenId, soloMinimos])

  const cargar = useCallback(async () => {
    try {
      const [existencias, movimientos, trans, adj] = await Promise.all([
        window.api.invoke<FilaInventario[]>('inventario.existencias', filtro),
        window.api.invoke<Fila[]>('inventario.kardex', { ...filtro, limite: 50 }),
        window.api.invoke<Fila[]>('inventario.transferencias'),
        window.api.invoke<Fila[]>('inventario.ajustes')
      ])
      setFilas(existencias)
      setKardex(movimientos)
      setTransferencias(trans)
      setAjustes(adj)
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [filtro])

  useEffect(() => { void cargar() }, [cargar])

  const filtradas = useMemo(() => filas.filter((f) => coincideTexto(
    [f.codigo, f.descripcion, f.almacenNombre].map(txt).join(' '), texto
  )), [filas, texto])

  const criticas = filtradas.filter((f) => num(f.cantidad) <= Math.max(num(f.existenciaMin), umbral))

  useEffect(() => {
    if (criticas.length === 0) return
    if (!nivelVisible('MEDIO', preferencias.alertas.nivelMinimo)) return
    toast.evento('STOCK_BAJO',
      `${criticas.length} referencia(s) con existencia crítica (umbral ${umbral}).`,
      `stock:${criticas.length}:${umbral}`)
  }, [criticas.length, umbral, preferencias.alertas.nivelMinimo])

  // Preferencia visual: oculta importes sin quitar el permiso `inventario.costo`.
  const mostrarCostos = puedeCosto && !preferencias.ocultarCostos
  const valorado = mostrarCostos
    ? filtradas.reduce((suma, f) => suma + num(f.valorCent), 0)
    : null

  async function verCostos(productoId: number): Promise<void> {
    try {
      const res = await window.api.invoke<{ historial: Fila[]; movimientos: Fila[] }>('inventario.costos', productoId)
      setCostos({
        productoId,
        nombre: productos.find((p) => p.id === productoId)?.descripcion ?? `Producto ${productoId}`,
        historial: res.historial ?? [],
        movimientos: res.movimientos ?? []
      })
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function exportar(): Promise<void> {
    setExportando(true)
    try {
      const res = await window.api.invoke<{ filename: string; base64: string }>('inventario.exportar', {
        vista: 'existencias', filtro
      })
      descargarArchivo(res.base64, res.filename)
      toast.success('Panel exportado a Excel.')
    } catch (e) { toast.error(errorInfo(e).message) } finally { setExportando(false) }
  }

  const columnas: Column<FilaInventario>[] = [
    { key: 'codigo', header: 'Código', value: (f) => txt(f.codigo) },
    { key: 'descripcion', header: 'Producto', value: (f) => txt(f.descripcion) },
    { key: 'almacenNombre', header: 'Almacén', value: (f) => txt(f.almacenNombre) },
    {
      key: 'cantidad', header: 'Existencia', value: (f) => num(f.cantidad),
      render: (f) => <span className="tabular-nums">{number(num(f.cantidad))}</span>
    },
    { key: 'minimo', header: 'Mínimo', value: (f) => num(f.existenciaMin) },
    {
      key: 'estado', header: 'Estado',
      value: (f) => num(f.cantidad) <= Math.max(num(f.existenciaMin), umbral) ? 'CRÍTICO' : 'NORMAL',
      render: (f) => num(f.cantidad) <= Math.max(num(f.existenciaMin), umbral)
        ? <Badge tone="danger">Crítico</Badge>
        : <Badge tone="success">Normal</Badge>
    },
    ...(mostrarCostos ? [{
      key: 'valorCent', header: 'Valorizado', value: (f: FilaInventario) => num(f.valorCent),
      render: (f: FilaInventario) => <span className="tabular-nums">{money(num(f.valorCent))}</span>
    }] : [])
  ]

  const columnasMov: Column<Fila>[] = [
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    { key: 'tipo', header: 'Tipo', value: (f) => txt(f.tipo) },
    { key: 'producto', header: 'Producto', value: (f) => txt(f.descripcion) || txt(f.productoNombre) },
    { key: 'cantidad', header: 'Cantidad', value: (f) => num(f.saldoCantidad ?? f.cantidad) },
    { key: 'referencia', header: 'Referencia', value: (f) => txt(f.referencia) }
  ]

  const columnasDoc: Column<Fila>[] = [
    { key: 'numero', header: 'Número', value: (f) => txt(f.numero) || `#${num(f.id)}` },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    { key: 'origen', header: 'Origen', value: (f) => txt(f.almacenOrigenNombre) },
    { key: 'destino', header: 'Destino', value: (f) => txt(f.almacenDestinoNombre) },
    { key: 'estado', header: 'Estado', value: (f) => txt(f.estado) }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Panel de control de stock"
        subtitle="Existencias críticas, valorización y movimientos recientes en una sola vista, con los permisos del inventario."
        actions={<div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => useAppStore.getState().setActiveView('inventario')}>
            Inventario completo <ArrowRight size={14} />
          </Button>
          {puedeExportar && <Button size="sm" variant="secondary" onClick={() => void exportar()} disabled={exportando}>
            <Download size={14} /> {exportando ? 'Exportando…' : 'Exportar'}
          </Button>}
          {puedeCrear && <Button size="sm" onClick={() => setMovimiento(true)}>
            <Plus size={14} /> Movimiento
          </Button>}
        </div>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Referencias visibles', valor: String(filtradas.length) },
          { label: 'Existencias críticas', valor: String(criticas.length) },
          { label: 'Almacenes', valor: String(almacenes.length) },
          { label: 'Valorizado', valor: valorado === null ? (puedeCosto ? 'Oculto por preferencia' : 'Sin permiso') : money(valorado) }
        ].map((tarjeta) => (
          <Card key={tarjeta.label}>
            <p className="text-xs text-slate-500">{tarjeta.label}</p>
            <p className="mt-1 text-xl font-semibold">{tarjeta.valor}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Almacén">
            <select className={inputClass} value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
              <option value="">Todos los almacenes</option>
              {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Field>
          <Field label="Solo críticos" hint={`Umbral administrativo: ${umbral}`}>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700">
              <input type="checkbox" checked={soloMinimos} onChange={(e) => setSoloMinimos(e.target.checked)} />
              Mostrar existencias por debajo del mínimo
            </label>
          </Field>
          <Field label="Buscar" hint="Código, producto o almacén; escribe sin pausa">
            <TextInput value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. ACEITE, A-01…" />
          </Field>
        </div>
      </Card>

      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'existencias', label: 'Existencias' },
        { id: 'movimientos', label: 'Movimientos recientes' },
        { id: 'transferencias', label: 'Transferencias y ajustes' }
      ]} />
      <TabPanel>
        {tab === 'existencias' && (
          <Card title="Existencias por producto" subtitle={`${criticas.length} referencia(s) requieren atención.`}>
            <DataTable
              columns={columnas}
              data={filtradas}
              rowKey={(f) => num(f.id)}
              actions={(f) => mostrarCostos && num(f.productoId) ? (
                <button
                  onClick={() => void verCostos(num(f.productoId))}
                  className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  title={titleSi(preferencias.tooltips, 'Ver histórico de costos')}
                >Costos</button>
              ) : null}
            />
          </Card>
        )}
        {tab === 'movimientos' && (
          <Card title="Últimos movimientos" subtitle="Máximo 50 registros del kardex de la empresa.">
            <DataTable columns={columnasMov} data={kardex} rowKey={(f) => num(f.id)} pageSize={12} />
          </Card>
        )}
        {tab === 'transferencias' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Transferencias" subtitle="Movimientos entre almacenes.">
              <DataTable columns={columnasDoc} data={transferencias} rowKey={(f) => num(f.id)} pageSize={8} />
            </Card>
            <Card title="Ajustes" subtitle="Conteos, pérdidas y correcciones auditadas.">
              <DataTable columns={columnasDoc} data={ajustes} rowKey={(f) => num(f.id)} pageSize={8} />
            </Card>
          </div>
        )}
      </TabPanel>

      {puedeCrear && (
        <MovimientoModal
          open={movimiento}
          almacenes={almacenes}
          productos={productos}
          onClose={() => setMovimiento(false)}
          onSaved={() => void cargar()}
        />
      )}

      <Modal open={costos !== null} title={`Costos de ${costos?.nombre ?? ''}`} onClose={() => setCostos(null)} width="max-w-4xl">
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Histórico de costos</h3>
            <DataTable
              columns={[
                { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
                { key: 'anterior', header: 'Anterior', value: (f) => money(num(f.costoAnteriorCent)) },
                { key: 'nuevo', header: 'Nuevo', value: (f) => money(num(f.costoNuevoCent)) },
                { key: 'origen', header: 'Origen', value: (f) => txt(f.origenDoc) }
              ]}
              data={costos?.historial ?? []}
              rowKey={(f) => num(f.id)}
              pageSize={6}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Movimientos del producto</h3>
            <DataTable columns={columnasMov} data={costos?.movimientos ?? []} rowKey={(f) => num(f.id)} pageSize={6} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

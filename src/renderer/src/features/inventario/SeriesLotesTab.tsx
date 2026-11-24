import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo } from '@/app/session'
import { number } from '@/lib/format'
import type { AlmacenOp, FilaInventario, ProductoOp } from './types'

interface Props { almacenes: AlmacenOp[]; productos: ProductoOp[] }

export function SeriesLotesTab({ almacenes, productos }: Props): React.JSX.Element {
  const [productoFiltro, setProductoFiltro] = useState('')
  const [series, setSeries] = useState<FilaInventario[]>([])
  const [lotes, setLotes] = useState<FilaInventario[]>([])
  const [serieForm, setSerieForm] = useState({ productoId: '', almacenId: '', serie: '' })
  const [loteForm, setLoteForm] = useState({ productoId: '', almacenId: '', lote: '', vencimiento: '', cantidad: '0' })
  const puedeCrear = can('inventario.crear')

  const productosSerie = productos.filter((p) => p.manejaSerie === 1)
  const productosLote = productos.filter((p) => p.manejaLote === 1)

  const load = useCallback(async () => {
    const filtro = productoFiltro ? { productoId: Number(productoFiltro) } : {}
    try {
      const [s, l] = await Promise.all([
        window.api.invoke<FilaInventario[]>('inventario.series', filtro),
        window.api.invoke<FilaInventario[]>('inventario.lotes', filtro)
      ])
      setSeries(s)
      setLotes(l)
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [productoFiltro])

  useEffect(() => { void load() }, [load])

  async function crearSerie(): Promise<void> {
    if (!serieForm.productoId || !serieForm.serie.trim()) {
      toast.warning('Seleccione producto e indique la serie.')
      return
    }
    try {
      await window.api.invoke('inventario.serie.crear', {
        productoId: Number(serieForm.productoId),
        ...(serieForm.almacenId ? { almacenId: Number(serieForm.almacenId) } : {}),
        serie: serieForm.serie.trim()
      })
      toast.success('Serie registrada.')
      setSerieForm({ ...serieForm, serie: '' })
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function crearLote(): Promise<void> {
    if (!loteForm.productoId || !loteForm.lote.trim()) {
      toast.warning('Seleccione producto e indique el lote.')
      return
    }
    try {
      await window.api.invoke('inventario.lote.crear', {
        productoId: Number(loteForm.productoId),
        ...(loteForm.almacenId ? { almacenId: Number(loteForm.almacenId) } : {}),
        lote: loteForm.lote.trim(),
        vencimiento: loteForm.vencimiento,
        cantidad: Number(loteForm.cantidad) || 0
      })
      toast.success('Lote registrado.')
      setLoteForm({ ...loteForm, lote: '', vencimiento: '', cantidad: '0' })
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const columnasSerie: Column<FilaInventario>[] = [
    { key: 'codigo', header: 'Producto', value: (r) => String(r.descripcion ?? '') },
    { key: 'serie', header: 'Serie', value: (r) => String(r.serie ?? '') },
    { key: 'almacen', header: 'Almacén', value: (r) => String(r.almacenNombre ?? '—') },
    {
      key: 'estado', header: 'Estado',
      render: (r) => r.estado === 'DISPONIBLE'
        ? <Badge tone="success">Disponible</Badge>
        : <Badge tone="danger">{String(r.estado)}</Badge>
    }
  ]

  const columnasLote: Column<FilaInventario>[] = [
    { key: 'producto', header: 'Producto', value: (r) => String(r.descripcion ?? '') },
    { key: 'lote', header: 'Lote', value: (r) => String(r.lote ?? '') },
    { key: 'almacen', header: 'Almacén', value: (r) => String(r.almacenNombre ?? '—') },
    { key: 'vencimiento', header: 'Vencimiento', value: (r) => String(r.vencimiento || '—') },
    { key: 'cantidad', header: 'Cantidad', value: (r) => number(r.cantidad) }
  ]

  return (
    <div className="grid gap-4">
      <Card subtitle="Filtre por producto para ver únicamente sus series y lotes.">
        <div className="w-80 max-w-full">
          <Field label="Producto">
            <select className={inputClass} value={productoFiltro} onChange={(e) => setProductoFiltro(e.target.value)}>
              <option value="">Todos</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Series">
        {puedeCrear && (
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Field label="Producto serializado">
              <select className={inputClass} value={serieForm.productoId} onChange={(e) => setSerieForm({ ...serieForm, productoId: e.target.value })}>
                <option value="">Seleccione…</option>
                {productosSerie.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
              </select>
            </Field>
            <Field label="Almacén">
              <select className={inputClass} value={serieForm.almacenId} onChange={(e) => setSerieForm({ ...serieForm, almacenId: e.target.value })}>
                <option value="">Sin asignar</option>
                {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Número de serie">
              <TextInput value={serieForm.serie} onChange={(e) => setSerieForm({ ...serieForm, serie: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button onClick={() => void crearSerie()}><Plus size={15} /> Agregar</Button>
            </div>
          </div>
        )}
        <DataTable columns={columnasSerie} data={series} rowKey={(r) => r.id} searchPlaceholder="Buscar series…" emptyText="No hay series registradas." />
      </Card>

      <Card title="Lotes">
        {puedeCrear && (
          <div className="mb-4 grid gap-3 sm:grid-cols-5">
            <Field label="Producto por lote">
              <select className={inputClass} value={loteForm.productoId} onChange={(e) => setLoteForm({ ...loteForm, productoId: e.target.value })}>
                <option value="">Seleccione…</option>
                {productosLote.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
              </select>
            </Field>
            <Field label="Almacén">
              <select className={inputClass} value={loteForm.almacenId} onChange={(e) => setLoteForm({ ...loteForm, almacenId: e.target.value })}>
                <option value="">Sin asignar</option>
                {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Lote">
              <TextInput value={loteForm.lote} onChange={(e) => setLoteForm({ ...loteForm, lote: e.target.value })} />
            </Field>
            <Field label="Vencimiento">
              <input type="date" className={inputClass} value={loteForm.vencimiento} onChange={(e) => setLoteForm({ ...loteForm, vencimiento: e.target.value })} />
            </Field>
            <Field label="Cantidad">
              <TextInput type="number" step="0.0001" value={loteForm.cantidad} onChange={(e) => setLoteForm({ ...loteForm, cantidad: e.target.value })} />
            </Field>
            <div className="flex items-end sm:col-span-5">
              <Button onClick={() => void crearLote()}><Plus size={15} /> Agregar lote</Button>
            </div>
          </div>
        )}
        <DataTable columns={columnasLote} data={lotes} rowKey={(r) => r.id} searchPlaceholder="Buscar lotes…" emptyText="No hay lotes registrados." />
      </Card>
    </div>
  )
}

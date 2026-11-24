import { useCallback, useEffect, useState } from 'react'
import { Download, History, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo } from '@/app/session'
import { money, number } from '@/lib/format'
import { MovimientoModal } from './MovimientoModal'
import { descargarArchivo } from './descargar'
import type { AlmacenOp, FilaInventario, KardexFiltroUI, ProductoOp } from './types'

interface Props {
  almacenes: AlmacenOp[]
  productos: ProductoOp[]
  onVerKardex: (filtro: KardexFiltroUI) => void
}

export function ExistenciasTab({ almacenes, productos, onVerKardex }: Props): React.JSX.Element {
  const [rows, setRows] = useState<FilaInventario[]>([])
  const [almacenId, setAlmacenId] = useState('')
  const [soloMinimos, setSoloMinimos] = useState(false)
  const [movimiento, setMovimiento] = useState<{ productoId?: number; almacenId?: number } | null>(null)
  const verCostos = can('inventario.costo')
  const puedeCrear = can('inventario.crear')
  const puedeExportar = can('inventario.exportar')

  const filtro = {
    ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    ...(soloMinimos ? { soloMinimos: true } : {})
  }

  const load = useCallback(async () => {
    try {
      setRows(await window.api.invoke<FilaInventario[]>('inventario.existencias', filtro))
    } catch (e) { toast.error(errorInfo(e).message) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenId, soloMinimos])

  useEffect(() => { void load() }, [load])

  async function exportar(): Promise<void> {
    try {
      const res = await window.api.invoke<{ filename: string; base64: string }>('inventario.exportar', {
        vista: 'existencias', filtro
      })
      descargarArchivo(res.base64, res.filename)
      toast.success('Existencias exportadas a Excel.')
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const columnas: Column<FilaInventario>[] = [
    { key: 'codigo', header: 'Código', value: (r) => String(r.codigo ?? '') },
    { key: 'descripcion', header: 'Producto', value: (r) => String(r.descripcion ?? '') },
    { key: 'almacenNombre', header: 'Almacén', value: (r) => String(r.almacenNombre ?? '') },
    { key: 'cantidad', header: 'Cantidad', value: (r) => number(r.cantidad) },
    { key: 'minimo', header: 'Mínimo', value: (r) => number(r.existenciaMin) },
    {
      key: 'estado', header: 'Estado',
      render: (r) => Number(r.cantidad) <= Number(r.existenciaMin)
        ? <Badge tone="danger">Bajo mínimo</Badge>
        : <Badge tone="success">Normal</Badge>
    },
    ...(verCostos
      ? [{ key: 'valorCent', header: 'Valorado', value: (r: FilaInventario) => money(Number(r.valorCent ?? 0)) }]
      : [])
  ]

  return (
    <Card subtitle="Saldo físico y valorado por producto y almacén. El kardex es la fuente de verdad.">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Almacén" className="w-56">
          <select className={inputClass} value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
            <option value="">Todos</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Field>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloMinimos} onChange={(e) => setSoloMinimos(e.target.checked)} />
          Solo bajo mínimo
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          {puedeExportar && <Button variant="secondary" onClick={() => void exportar()}><Download size={15} /> Exportar</Button>}
          {puedeCrear && <Button onClick={() => setMovimiento({ almacenId: almacenId ? Number(almacenId) : undefined })}><Plus size={15} /> Movimiento</Button>}
        </div>
      </div>
      <DataTable
        columns={columnas}
        data={rows}
        rowKey={(r) => r.id}
        searchPlaceholder="Buscar por código, producto o almacén…"
        emptyText="Aún no hay existencias registradas. Use «Movimiento» para dar entrada de mercancía."
        actions={(r) => (
          <button
            onClick={() => onVerKardex({ productoId: Number(r.productoId), almacenId: Number(r.almacenId) })}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Ver kardex"
          ><History size={15} /></button>
        )}
      />
      <MovimientoModal
        open={!!movimiento}
        almacenes={almacenes}
        productos={productos}
        inicial={movimiento ?? undefined}
        onClose={() => setMovimiento(null)}
        onSaved={() => void load()}
      />
    </Card>
  )
}

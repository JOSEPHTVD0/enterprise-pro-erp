import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo } from '@/app/session'
import { money, number } from '@/lib/format'
import { descargarArchivo } from './descargar'
import type { AlmacenOp, FilaInventario, KardexFiltroUI, ProductoOp } from './types'

const TIPOS = [
  'COMPRA', 'VENTA', 'DEV_VENTA', 'DEV_COMPRA', 'TRANSFERENCIA_ENTRADA',
  'TRANSFERENCIA_SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA',
  'PERDIDA', 'DANIO', 'CONTEO', 'PRODUCCION'
]

interface Props {
  almacenes: AlmacenOp[]
  productos: ProductoOp[]
  filtroInicial?: KardexFiltroUI
}

export function KardexTab({ almacenes, productos, filtroInicial }: Props): React.JSX.Element {
  const [rows, setRows] = useState<FilaInventario[]>([])
  const [productoId, setProductoId] = useState(String(filtroInicial?.productoId ?? ''))
  const [almacenId, setAlmacenId] = useState(String(filtroInicial?.almacenId ?? ''))
  const [tipo, setTipo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const verCostos = can('inventario.costo')
  const puedeExportar = can('inventario.exportar')

  useEffect(() => {
    if (filtroInicial?.productoId) setProductoId(String(filtroInicial.productoId))
    if (filtroInicial?.almacenId) setAlmacenId(String(filtroInicial.almacenId))
  }, [filtroInicial?.productoId, filtroInicial?.almacenId])

  const filtro = {
    ...(productoId ? { productoId: Number(productoId) } : {}),
    ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    ...(tipo ? { tipo } : {}),
    ...(desde ? { fechaDesde: desde } : {}),
    ...(hasta ? { fechaHasta: hasta } : {}),
    limite: 500
  }

  const load = useCallback(async () => {
    try {
      setRows(await window.api.invoke<FilaInventario[]>('inventario.kardex', filtro))
    } catch (e) { toast.error(errorInfo(e).message) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId, almacenId, tipo, desde, hasta])

  useEffect(() => { void load() }, [load])

  async function exportar(): Promise<void> {
    try {
      const res = await window.api.invoke<{ filename: string; base64: string }>('inventario.exportar', {
        vista: 'kardex', filtro
      })
      descargarArchivo(res.base64, res.filename)
      toast.success('Kardex exportado a Excel.')
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const columnas: Column<FilaInventario>[] = [
    { key: 'fecha', header: 'Fecha', value: (r) => String(r.fecha ?? '') },
    {
      key: 'tipo', header: 'Tipo',
      render: (r) => Number(r.cantidad) > 0
        ? <Badge tone="success">{String(r.tipo)}</Badge>
        : <Badge tone="danger">{String(r.tipo)}</Badge>
    },
    { key: 'descripcion', header: 'Producto', value: (r) => String(r.descripcion ?? '') },
    { key: 'almacenNombre', header: 'Almacén', value: (r) => String(r.almacenNombre ?? '') },
    { key: 'cantidad', header: 'Cantidad', value: (r) => number(r.cantidad) },
    ...(verCostos
      ? [
        { key: 'costoUnitCent', header: 'Costo unit.', value: (r: FilaInventario) => money(Number(r.costoUnitCent ?? 0)) },
        { key: 'costoTotalCent', header: 'Costo total', value: (r: FilaInventario) => money(Number(r.costoTotalCent ?? 0)) },
        { key: 'saldoCostoCent', header: 'Saldo valorado', value: (r: FilaInventario) => money(Number(r.saldoCostoCent ?? 0)) }
      ]
      : []),
    { key: 'saldoCantidad', header: 'Saldo cant.', value: (r) => number(r.saldoCantidad) },
    { key: 'docTipo', header: 'Documento', value: (r) => String(r.docTipo ?? '') },
    { key: 'motivo', header: 'Motivo', value: (r) => String(r.motivo ?? '') }
  ]

  return (
    <Card subtitle="Historial inmutable de entradas y salidas con saldos al momento de cada movimiento.">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Producto" className="w-60">
          <select className={inputClass} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">Todos</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
          </select>
        </Field>
        <Field label="Almacén" className="w-44">
          <select className={inputClass} value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
            <option value="">Todos</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Field>
        <Field label="Tipo" className="w-48">
          <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Desde" className="w-36">
          <input type="date" className={inputClass} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta" className="w-36">
          <input type="date" className={inputClass} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        {puedeExportar && <Button variant="secondary" onClick={() => void exportar()}><Download size={15} /> Exportar</Button>}
      </div>
      <DataTable
        columns={columnas}
        data={rows}
        rowKey={(r) => r.id}
        pageSize={15}
        searchPlaceholder="Buscar en el kardex…"
        emptyText="No hay movimientos para los filtros seleccionados."
      />
    </Card>
  )
}

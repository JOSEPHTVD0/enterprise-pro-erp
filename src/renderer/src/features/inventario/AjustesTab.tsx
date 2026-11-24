import { useCallback, useEffect, useState } from 'react'
import { Eye, Plus, ShieldX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo } from '@/app/session'
import { centavosDesdeDecimal } from '@shared/dinero'
import { number } from '@/lib/format'
import type { AlmacenOp, FilaInventario, ProductoOp } from './types'

const TIPOS = [
  { value: 'AJUSTE', label: 'Ajuste general' },
  { value: 'CONTEO', label: 'Conteo físico' },
  { value: 'PERDIDA', label: 'Pérdida' },
  { value: 'DANIO', label: 'Daño' }
] as const

interface LineaForm { productoId: string; cantidad: string; cantidadNueva: string; costo: string }
interface Forma {
  tipo: string
  almacenId: string
  motivo: string
  lineas: LineaForm[]
}

const lineaVacia = (): LineaForm => ({ productoId: '', cantidad: '', cantidadNueva: '', costo: '0' })

interface Props { almacenes: AlmacenOp[]; productos: ProductoOp[] }

export function AjustesTab({ almacenes, productos }: Props): React.JSX.Element {
  const [rows, setRows] = useState<FilaInventario[]>([])
  const [forma, setForma] = useState<Forma | null>(null)
  const [detalle, setDetalle] = useState<{ cabecera: FilaInventario; lineas: FilaInventario[] } | null>(null)
  const [confirmar, setConfirmar] = useState<FilaInventario | null>(null)
  const [saving, setSaving] = useState(false)
  const puedeCrear = can('inventario.crear')
  const puedeModificar = can('inventario.modificar')

  const load = useCallback(async () => {
    try { setRows(await window.api.invoke<FilaInventario[]>('inventario.ajustes')) }
    catch (e) { toast.error(errorInfo(e).message) }
  }, [])
  useEffect(() => { void load() }, [load])

  function abrirNuevo(): void {
    setForma({
      tipo: 'AJUSTE',
      almacenId: String(almacenes[0]?.id ?? ''),
      motivo: '',
      lineas: [lineaVacia()]
    })
  }

  function cambiarLinea(index: number, campo: keyof LineaForm, valor: string): void {
    if (!forma) return
    const lineas = [...forma.lineas]
    lineas[index] = { ...lineas[index], [campo]: valor }
    setForma({ ...forma, lineas })
  }

  async function guardar(): Promise<void> {
    if (!forma) return
    if (!forma.almacenId || forma.motivo.trim().length < 3) {
      toast.warning('Seleccione almacén e indique un motivo de al menos 3 caracteres.')
      return
    }
    const lineas = forma.lineas
      .filter((l) => l.productoId)
      .map((l) => ({
        productoId: Number(l.productoId),
        ...(forma.tipo === 'CONTEO'
          ? { cantidadNueva: Number(l.cantidadNueva) }
          : { cantidad: Number(l.cantidad) }),
        ...(Number(l.costo) > 0 ? { costoUnitCent: centavosDesdeDecimal(Number(l.costo)) } : {})
      }))
    if (!lineas.length) { toast.warning('Agregue al menos una línea con producto.'); return }

    setSaving(true)
    try {
      await window.api.invoke('inventario.ajuste', {
        tipo: forma.tipo, almacenId: Number(forma.almacenId), motivo: forma.motivo, lineas
      })
      toast.success('Ajuste aplicado y registrado en el kardex.')
      setForma(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setSaving(false) }
  }

  async function verDetalle(row: FilaInventario): Promise<void> {
    try {
      setDetalle(await window.api.invoke<{ cabecera: FilaInventario; lineas: FilaInventario[] }>('inventario.detalleAjuste', row.id))
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function anular(): Promise<void> {
    if (!confirmar) return
    try {
      await window.api.invoke('inventario.anularAjuste', confirmar.id)
      toast.success('Ajuste anulado mediante movimientos inversos.')
      setConfirmar(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const columnas: Column<FilaInventario>[] = [
    { key: 'numero', header: 'Número', value: (r) => String(r.numero ?? '') },
    { key: 'fecha', header: 'Fecha', value: (r) => String(r.fecha ?? '') },
    { key: 'tipo', header: 'Tipo', value: (r) => String(r.tipo ?? '') },
    { key: 'almacen', header: 'Almacén', value: (r) => String(r.almacenNombre ?? '') },
    { key: 'motivo', header: 'Motivo', value: (r) => String(r.motivo ?? '') },
    {
      key: 'estado', header: 'Estado',
      render: (r) => r.estado === 'ANULADO'
        ? <Badge tone="danger">Anulado</Badge>
        : <Badge tone="success">Activo</Badge>
    }
  ]

  return (
    <Card subtitle="Ajustes, conteos físicos, pérdidas y daños. Cada línea genera un movimiento auditable.">
      <div className="mb-4 flex justify-end">
        {puedeCrear && <Button onClick={abrirNuevo}><Plus size={15} /> Nuevo ajuste</Button>}
      </div>
      <DataTable
        columns={columnas}
        data={rows}
        rowKey={(r) => r.id}
        searchPlaceholder="Buscar ajustes…"
        emptyText="Aún no hay ajustes registrados."
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <button onClick={() => void verDetalle(r)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Ver detalle"><Eye size={15} /></button>
            {puedeModificar && r.estado !== 'ANULADO' && (
              <button onClick={() => setConfirmar(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Anular"><ShieldX size={15} /></button>
            )}
          </div>
        )}
      />

      <Modal
        open={!!forma}
        title="Nuevo ajuste de inventario"
        onClose={() => setForma(null)}
        width="max-w-4xl"
        footer={<>
          <Button variant="secondary" onClick={() => setForma(null)}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={saving}>{saving ? 'Aplicando…' : 'Aplicar ajuste'}</Button>
        </>}
      >
        {forma && (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tipo">
                <select className={inputClass} value={forma.tipo} onChange={(e) => setForma({ ...forma, tipo: e.target.value })}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Almacén">
                <select className={inputClass} value={forma.almacenId} onChange={(e) => setForma({ ...forma, almacenId: e.target.value })}>
                  <option value="">Seleccione…</option>
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </Field>
              <Field label="Motivo">
                <TextInput value={forma.motivo} onChange={(e) => setForma({ ...forma, motivo: e.target.value })} placeholder="Ej. Inventario físico mensual" />
              </Field>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2">{forma.tipo === 'CONTEO' ? 'Cantidad contada' : 'Cantidad (+ / -)'}</th>
                    <th className="px-2 py-2">Costo unit. (RD$)</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {forma.lineas.map((linea, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2">
                        <select className={inputClass} value={linea.productoId} onChange={(e) => cambiarLinea(i, 'productoId', e.target.value)}>
                          <option value="">Seleccione…</option>
                          {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <TextInput
                          type="number"
                          step="0.0001"
                          value={forma.tipo === 'CONTEO' ? linea.cantidadNueva : linea.cantidad}
                          onChange={(e) => cambiarLinea(i, forma.tipo === 'CONTEO' ? 'cantidadNueva' : 'cantidad', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <TextInput type="number" step="0.01" value={linea.costo} onChange={(e) => cambiarLinea(i, 'costo', e.target.value)} />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => setForma({ ...forma, lineas: forma.lineas.filter((_, idx) => idx !== i) })}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Quitar línea"
                        ><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="secondary"
              className="justify-self-start"
              onClick={() => setForma({ ...forma, lineas: [...forma.lineas, lineaVacia()] })}
            ><Plus size={15} /> Agregar línea</Button>
            <p className="text-xs text-slate-400">
              En conteos, la cantidad contada se compara con el saldo actual y se genera la diferencia.
              En pérdidas y daños use valores negativos.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!detalle}
        title={`Detalle del ajuste ${detalle?.cabecera.numero ?? ''}`}
        onClose={() => setDetalle(null)}
        footer={<Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        {detalle && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr><th className="py-2">Producto</th><th className="text-right">Cantidad</th><th className="text-right"> Nuevo saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {detalle.lineas.map((l) => (
                <tr key={Number(l.id)}>
                  <td className="py-2">{String(l.descripcion ?? '')}</td>
                  <td className="text-right">{number(l.cantidad)}</td>
                  <td className="text-right">{l.cantidadNueva === null || l.cantidadNueva === undefined ? '—' : number(l.cantidadNueva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal
        open={!!confirmar}
        title="Anular ajuste"
        onClose={() => setConfirmar(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmar(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void anular()}>Anular</Button>
        </>}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Se crearán movimientos inversos para revertir el ajuste «{String(confirmar?.numero ?? '')}».
          El kardex original no se modificará ni se eliminará.
        </p>
      </Modal>
    </Card>
  )
}

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { errorInfo } from '@/app/session'
import { centavosDesdeDecimal } from '@shared/dinero'
import type { AlmacenOp, ProductoOp } from './types'

const TIPOS = [
  { value: 'COMPRA', label: 'Entrada por compra', signo: 1 },
  { value: 'DEV_VENTA', label: 'Devolución de venta', signo: 1 },
  { value: 'AJUSTE_ENTRADA', label: 'Ajuste positivo', signo: 1 },
  { value: 'PRODUCCION', label: 'Producción', signo: 1 },
  { value: 'AJUSTE_SALIDA', label: 'Ajuste negativo', signo: -1 },
  { value: 'PERDIDA', label: 'Pérdida', signo: -1 },
  { value: 'DANIO', label: 'Daño', signo: -1 }
] as const

interface Props {
  open: boolean
  almacenes: AlmacenOp[]
  productos: ProductoOp[]
  inicial?: { productoId?: number; almacenId?: number }
  onClose: () => void
  onSaved: () => void
}

export function MovimientoModal({ open, almacenes, productos, inicial, onClose, onSaved }: Props): React.JSX.Element {
  const [productoId, setProductoId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [tipo, setTipo] = useState<string>('COMPRA')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('0')
  const [motivo, setMotivo] = useState('')
  const [referencia, setReferencia] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setProductoId(String(inicial?.productoId ?? productos[0]?.id ?? ''))
    setAlmacenId(String(inicial?.almacenId ?? almacenes[0]?.id ?? ''))
    setTipo('COMPRA')
    setCantidad('')
    setCosto('0')
    setMotivo('')
    setReferencia('')
  }, [open, inicial, productos, almacenes])

  const esEntrada = TIPOS.find((t) => t.value === tipo)?.signo === 1

  async function guardar(): Promise<void> {
    if (!productoId || !almacenId || !cantidad || Number(cantidad) <= 0) {
      toast.warning('Seleccione producto, almacén y una cantidad mayor que cero.')
      return
    }
    setSaving(true)
    try {
      await window.api.invoke('inventario.movimiento', {
        productoId: Number(productoId),
        almacenId: Number(almacenId),
        tipo,
        cantidad: (esEntrada ? 1 : -1) * Number(cantidad),
        costoUnitCent: centavosDesdeDecimal(Number(costo) || 0),
        motivo,
        referencia
      })
      toast.success('Movimiento registrado en el kardex.')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errorInfo(e).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Nuevo movimiento de inventario"
      onClose={onClose}
      width="max-w-2xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void guardar()} disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Producto" className="sm:col-span-2">
          <select className={inputClass} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">Seleccione…</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>)}
          </select>
        </Field>
        <Field label="Almacén">
          <select className={inputClass} value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
            <option value="">Seleccione…</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Field>
        <Field label="Tipo de movimiento">
          <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Cantidad" hint={esEntrada ? 'Se registrará como entrada.' : 'Se registrará como salida.'}>
          <TextInput type="number" min="0" step="0.0001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </Field>
        <Field label="Costo unitario (RD$)" hint="Se usa para recalcular el promedio en entradas.">
          <TextInput type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </Field>
        <Field label="Motivo" className="sm:col-span-2">
          <TextInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Detalle de la operación" />
        </Field>
        <Field label="Referencia" className="sm:col-span-2">
          <TextInput value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Documento o número externo (opcional)" />
        </Field>
      </div>
    </Modal>
  )
}

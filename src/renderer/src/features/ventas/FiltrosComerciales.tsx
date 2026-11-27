import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { filtroComercialVacio, type FiltroComercial } from './filtros-comerciales'

interface OpcionCatalogo {
  id?: unknown
  nombre?: unknown
  codigo?: unknown
  descripcion?: unknown
}

interface Props<C extends OpcionCatalogo, P extends OpcionCatalogo> {
  filtro: FiltroComercial
  onChange: (filtro: FiltroComercial) => void
  onAplicar: () => void
  onLimpiar: () => void
  clientes: C[]
  productos: P[]
  estados?: string[]
  tipos?: string[]
  titulo?: string
}

const texto = (valor: unknown): string => (valor === undefined || valor === null ? '' : String(valor))

/** Búsqueda filtrada homogénea para facturas, cobros y panel unificado. */
export function FiltrosComerciales<C extends OpcionCatalogo, P extends OpcionCatalogo>({
  filtro, onChange, onAplicar, onLimpiar, clientes, productos, estados, tipos, titulo
}: Props<C, P>): React.JSX.Element {
  const opcionesClientes = [
    { value: '', label: 'Todos' },
    ...clientes.map((c) => ({ value: texto(c.id), label: texto(c.nombre) || texto(c.id) }))
  ]
  const opcionesProductos = [
    { value: '', label: 'Todos' },
    ...productos.map((p) => ({
      value: texto(p.id),
      label: `${texto(p.codigo) ? `${texto(p.codigo)} · ` : ''}${texto(p.descripcion) || texto(p.id)}`
    }))
  ]
  const estadosPorDefecto = ['ACTIVO', 'PENDIENTE', 'CONTABILIZADO', 'PAGADO', 'ANULADO']
  const tiposPorDefecto = ['FACTURA_CONTADO', 'FACTURA_CREDITO', 'POS', 'NOTA_CREDITO', 'DEVOLUCION_VENTA']

  return (
    <Card className="mb-4" title={titulo ?? 'Búsqueda filtrada'} subtitle="Cliente, número, estado, fechas, monto y producto.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Cliente">
          <select className={inputClass} value={filtro.cliente}
            onChange={(e) => onChange({ ...filtro, cliente: e.target.value })} aria-label="Cliente">
            {opcionesClientes.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>
        </Field>
        <Field label="Número">
          <TextInput value={filtro.numero} placeholder="Ej. FAC-0001" maxLength={60}
            onChange={(e) => onChange({ ...filtro, numero: e.target.value })} />
        </Field>
        <Field label="Estado">
          <select className={inputClass} value={filtro.estado}
            onChange={(e) => onChange({ ...filtro, estado: e.target.value })} aria-label="Estado">
            <option value="">Todos</option>
            {(estados ?? estadosPorDefecto).map((estado) => <option key={estado} value={estado}>{estado}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className={inputClass} value={filtro.tipo}
            onChange={(e) => onChange({ ...filtro, tipo: e.target.value })} aria-label="Tipo">
            <option value="">Todos</option>
            {(tipos ?? tiposPorDefecto).map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
        </Field>
        <Field label="Producto">
          <select className={inputClass} value={filtro.productoId}
            onChange={(e) => onChange({ ...filtro, productoId: e.target.value })} aria-label="Producto">
            {opcionesProductos.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>
        </Field>
        <Field label="Desde"><TextInput type="date" value={filtro.desde}
          onChange={(e) => onChange({ ...filtro, desde: e.target.value })} /></Field>
        <Field label="Hasta"><TextInput type="date" value={filtro.hasta}
          onChange={(e) => onChange({ ...filtro, hasta: e.target.value })} /></Field>
        <Field label="Monto mínimo">
          <TextInput type="number" min="0" step="0.01" value={filtro.montoMin}
            onChange={(e) => onChange({ ...filtro, montoMin: e.target.value })} />
        </Field>
        <Field label="Monto máximo">
          <TextInput type="number" min="0" step="0.01" value={filtro.montoMax}
            onChange={(e) => onChange({ ...filtro, montoMax: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { onChange(filtroComercialVacio()); onLimpiar() }}>Limpiar</Button>
        <Button variant="secondary" onClick={onAplicar}><Filter size={14} /> Aplicar filtros</Button>
      </div>
    </Card>
  )
}

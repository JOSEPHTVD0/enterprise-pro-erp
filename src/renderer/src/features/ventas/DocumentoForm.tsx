import type { ReactNode } from 'react'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { money } from '@/lib/format'
import { CarritoEditor } from './CarritoEditor'
import { totalesCarrito } from './carrito'
import type { CatalogosVentas, FormularioVenta } from './types'

interface Props {
  catalogos: CatalogosVentas
  form: FormularioVenta
  onChange: (form: FormularioVenta) => void
  permitirDescuento?: boolean
  permitirPrecio?: boolean
  mostrarVencimiento?: boolean
  children?: ReactNode
}

/** Cabecera + líneas + totales, compartida por los tres módulos de Fase 6. */
export function DocumentoForm({
  catalogos, form, onChange, permitirDescuento = true, permitirPrecio = true,
  mostrarVencimiento = false, children
}: Props): React.JSX.Element {
  const totales = totalesCarrito(catalogos, form.lineas)

  function actualizar(cambios: Partial<FormularioVenta>): void {
    onChange({ ...form, ...cambios })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Cliente *">
          <select
            className={inputClass}
            value={form.clienteId}
            onChange={(e) => actualizar({ clienteId: e.target.value })}
            aria-label="Cliente"
          >
            <option value="">Seleccione…</option>
            {catalogos.clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}{cliente.rncCedula ? ` · ${cliente.rncCedula}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Almacén">
          <select
            className={inputClass}
            value={form.almacenId}
            onChange={(e) => actualizar({ almacenId: e.target.value })}
            aria-label="Almacén"
          >
            <option value="">Predeterminado</option>
            {catalogos.almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Vendedor">
          <select
            className={inputClass}
            value={form.vendedorId}
            onChange={(e) => actualizar({ vendedorId: e.target.value })}
            aria-label="Vendedor"
          >
            <option value="">Sin vendedor</option>
            {catalogos.vendedores.map((vendedor) => (
              <option key={vendedor.id} value={vendedor.id}>{vendedor.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <TextInput
            type="date"
            value={form.fecha}
            onChange={(e) => actualizar({ fecha: e.target.value })}
          />
        </Field>
        {mostrarVencimiento && (
          <Field label="Vencimiento" hint="Si se omite, se usa la condición de pago del cliente.">
            <TextInput
              type="date"
              value={form.vencimiento}
              onChange={(e) => actualizar({ vencimiento: e.target.value })}
            />
          </Field>
        )}
        <Field label="Comentarios" className={mostrarVencimiento ? '' : 'lg:col-span-2'}>
          <TextInput
            value={form.comentarios}
            maxLength={500}
            onChange={(e) => actualizar({ comentarios: e.target.value })}
            placeholder="Observaciones del documento"
          />
        </Field>
      </div>

      <CarritoEditor
        catalogos={catalogos}
        lineas={form.lineas}
        onChange={(lineas) => actualizar({ lineas })}
        permitirDescuento={permitirDescuento}
        permitirPrecio={permitirPrecio}
      />

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-4">
        <div><p className="text-[11px] text-slate-500">Subtotal</p><p className="font-medium tabular-nums">{money(totales.subtotalCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">Descuento</p><p className="font-medium tabular-nums">{money(totales.descuentoCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">ITBIS</p><p className="font-medium tabular-nums">{money(totales.impuestoCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">Total</p><p className="text-base font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{money(totales.totalCent)}</p></div>
      </div>

      {children}
    </div>
  )
}

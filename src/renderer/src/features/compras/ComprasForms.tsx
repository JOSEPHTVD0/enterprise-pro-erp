import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { centavosDesdeDecimal } from '@shared/dinero'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { money, number } from '@/lib/format'
import { nuevaLinea, totalesCarrito } from './carrito'
import {
  clave, etiquetasTipo, metodosPago, num, txt,
  type CatalogosCompras, type Fila, type FormularioCompra,
  type LineaCompra, type MetodoPago, type PagoCompraForm
} from './types'

interface LineasProps {
  catalogos: CatalogosCompras
  lineas: LineaCompra[]
  onChange: (lineas: LineaCompra[]) => void
  permitirGasto?: boolean
}

/** Líneas de compra: costo, descuento, impuesto, gasto y serie/lote. */
export function LineasEditor({ catalogos, lineas, onChange, permitirGasto = true }: LineasProps): React.JSX.Element {
  function actualizar(key: string, cambios: Partial<LineaCompra>): void {
    onChange(lineas.map((linea) => (linea.key === key ? { ...linea, ...cambios } : linea)))
  }

  function elegirProducto(linea: LineaCompra, productoId: string): void {
    const producto = catalogos.productos.find((p) => String(p.id) === productoId)
    const ultimo = num(producto?.costoUltimaCompraCent) || num(producto?.costoPromedioCent)
    actualizar(linea.key, {
      productoId,
      costo: ultimo ? (ultimo / 100).toFixed(2) : '0.00',
      impuestoId: producto?.impuestoId
        ? String(producto.impuestoId)
        : (catalogos.impuestos.find((i) => i.codigo === catalogos.impuestoPorDefecto)?.id.toString() ?? '')
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Líneas del documento · {lineas.length}
        </p>
        <Button size="sm" variant="secondary" onClick={() => onChange([...lineas, nuevaLinea(catalogos)])}>
          <Plus size={14} /> Agregar línea
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[1050px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2">Producto</th>
              <th className="w-20 px-2 py-2">Cant.</th>
              <th className="w-28 px-2 py-2">Costo RD$</th>
              <th className="w-20 px-2 py-2">Desc. %</th>
              {permitirGasto && <th className="w-24 px-2 py-2">Gasto RD$</th>}
              <th className="w-36 px-2 py-2">Impuesto</th>
              <th className="w-16 px-2 py-2">Exento</th>
              <th className="w-40 px-2 py-2">Serie / Lote</th>
              <th className="w-24 px-2 py-2 text-right">Total</th>
              <th className="w-9 px-1 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineas.map((linea) => {
              const producto = catalogos.productos.find((p) => String(p.id) === linea.productoId)
              const total = totalesCarrito(catalogos, [linea]).totalCent
              return (
                <tr key={linea.key}>
                  <td className="px-2 py-1.5">
                    <select
                      className={`${inputClass} h-8`}
                      value={linea.productoId}
                      onChange={(e) => elegirProducto(linea, e.target.value)}
                      aria-label="Producto"
                    >
                      <option value="">Seleccione…</option>
                      {catalogos.productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.descripcion}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal" min="0.0001" step="0.01"
                      value={linea.cantidad} onChange={(e) => actualizar(linea.key, { cantidad: e.target.value })}
                      aria-label="Cantidad" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal" min="0" step="0.01"
                      value={linea.costo} onChange={(e) => actualizar(linea.key, { costo: e.target.value })}
                      aria-label="Costo" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal" min="0" max="100" step="0.01"
                      value={linea.descuentoPct} onChange={(e) => actualizar(linea.key, { descuentoPct: e.target.value })}
                      aria-label="Descuento porcentual" />
                  </td>
                  {permitirGasto && (
                    <td className="px-2 py-1.5">
                      <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal" min="0" step="0.01"
                        value={linea.gasto} onChange={(e) => actualizar(linea.key, { gasto: e.target.value })}
                        aria-label="Gasto asociado" />
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    <select className={`${inputClass} h-8`} value={linea.impuestoId}
                      onChange={(e) => actualizar(linea.key, { impuestoId: e.target.value })}
                      aria-label="Impuesto">
                      <option value="">Sin impuesto</option>
                      {catalogos.impuestos.map((i) => (
                        <option key={i.id} value={i.id}>{i.codigo} · {number(num(i.tasaBp) / 100)}%</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={linea.exento}
                      onChange={(e) => actualizar(linea.key, { exento: e.target.checked })}
                      aria-label="Exento" className="h-4 w-4 accent-indigo-600" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={`${inputClass} h-8 px-2`}
                      placeholder={producto?.manejaSerie ? 'Serie obligatoria' : 'Serie'}
                      value={linea.numeroSerie}
                      onChange={(e) => actualizar(linea.key, { numeroSerie: e.target.value })}
                      aria-label="Número de serie" />
                    <input className={`${inputClass} mt-1 h-8 px-2`}
                      placeholder={producto?.manejaLote ? 'Lote obligatorio' : 'Lote'}
                      value={linea.lote}
                      onChange={(e) => actualizar(linea.key, { lote: e.target.value })}
                      aria-label="Lote" />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{money(total)}</td>
                  <td className="px-1 py-1.5">
                    <button
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      onClick={() => onChange(lineas.filter((l) => l.key !== linea.key))}
                      aria-label="Quitar línea"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {lineas.length === 0 && (
              <tr><td colSpan={permitirGasto ? 10 : 9} className="px-3 py-6 text-center text-slate-400">
                Agregue al menos una línea para continuar.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Pagos combinados. El backend exige que la suma cuadre exactamente con el total. */
export function PagosEditor({
  totalCent, pagos, onChange
}: {
  totalCent: number
  pagos: PagoCompraForm[]
  onChange: (pagos: PagoCompraForm[]) => void
}): React.JSX.Element {
  const pagadoCent = pagos.reduce((suma, pago) => suma + centavosDesdeDecimal(Number(pago.monto) || 0), 0)
  const pendienteCent = totalCent - pagadoCent

  function actualizar(key: string, cambios: Partial<PagoCompraForm>): void {
    onChange(pagos.map((pago) => (pago.key === key ? { ...pago, ...cambios } : pago)))
  }

  function completarResto(): void {
    if (!pagos.length || pendienteCent <= 0) return
    const primera = pagos[0]
    const nuevoCent = centavosDesdeDecimal(Number(primera.monto) || 0) + pendienteCent
    actualizar(primera.key, { monto: (nuevoCent / 100).toFixed(2) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pagos de la factura</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={completarResto} disabled={pendienteCent <= 0}>
            Completar resto
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => onChange([...pagos, { key: clave(), metodo: 'EFECTIVO', monto: '', referencia: '' }])}>
            <Plus size={14} /> Agregar pago
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2">Método</th>
              <th className="w-32 px-2 py-2">Monto RD$</th>
              <th className="px-2 py-2">Referencia</th>
              <th className="w-9 px-1 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagos.map((pago) => (
              <tr key={pago.key}>
                <td className="px-2 py-1.5">
                  <select className={`${inputClass} h-8`} value={pago.metodo}
                    onChange={(e) => actualizar(pago.key, { metodo: e.target.value as MetodoPago })}
                    aria-label="Método de pago">
                    {metodosPago.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal" min="0" step="0.01"
                    value={pago.monto} onChange={(e) => actualizar(pago.key, { monto: e.target.value })}
                    aria-label="Monto del pago" />
                </td>
                <td className="px-2 py-1.5">
                  <input className={`${inputClass} h-8 px-2`} value={pago.referencia}
                    onChange={(e) => actualizar(pago.key, { referencia: e.target.value })}
                    placeholder="Opcional" aria-label="Referencia" />
                </td>
                <td className="px-1 py-1.5">
                  <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                    onClick={() => onChange(pagos.filter((p) => p.key !== pago.key))} aria-label="Quitar pago">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {pagos.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-400">Registre al menos un pago.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
        <span className="text-slate-500">Total: <strong>{money(totalCent)}</strong></span>
        <span className="text-slate-500">Pagado: <strong>{money(pagadoCent)}</strong></span>
        {pendienteCent !== 0 && (
          <span className={pendienteCent > 0 ? 'text-amber-600' : 'text-red-600'}>
            {pendienteCent > 0 ? 'Falta' : 'Sobra'}: {money(Math.abs(pendienteCent))}
          </span>
        )}
      </div>
    </div>
  )
}

/** Cabecera, líneas, totales y pago. Compartido por solicitudes, órdenes y facturas. */
export function CompraForm({
  catalogos, form, onChange, origenes = [], children
}: {
  catalogos: CatalogosCompras
  form: FormularioCompra
  onChange: (form: FormularioCompra) => void
  origenes?: Fila[]
  children?: ReactNode
}): React.JSX.Element {
  const totales = totalesCarrito(catalogos, form.lineas)
  const origen = form.docOrigenId ? origenes.find((o) => String(o.id) === form.docOrigenId) : undefined
  const conOrigen = Boolean(origen)

  function actualizar(cambios: Partial<FormularioCompra>): void {
    onChange({ ...form, ...cambios })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Proveedor *">
          <select className={inputClass} value={form.proveedorId}
            onChange={(e) => actualizar({ proveedorId: e.target.value })} aria-label="Proveedor">
            <option value="">Seleccione…</option>
            {catalogos.proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombreComercial}{proveedor.rnc ? ` · ${proveedor.rnc}` : ''}
              </option>
            ))}
          </select>
        </Field>
        {origenes.length > 0 && (
          <Field label="Desde documento" hint="Si se elige, se factura lo recibido o pendiente de esa orden.">
            <select className={inputClass} value={form.docOrigenId}
              onChange={(e) => actualizar({ docOrigenId: e.target.value })} aria-label="Documento de origen">
              <option value="">Directa (sin origen)</option>
              {origenes.map((o) => (
                <option key={num(o.id)} value={num(o.id)}>
                  {etiquetasTipo[txt(o.tipo)] ?? txt(o.tipo)} {txt(o.numero)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Almacén">
          <select className={inputClass} value={form.almacenId}
            onChange={(e) => actualizar({ almacenId: e.target.value })} aria-label="Almacén">
            <option value="">Predeterminado</option>
            {catalogos.almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <TextInput type="date" value={form.fecha} onChange={(e) => actualizar({ fecha: e.target.value })} />
        </Field>
        {(form.credito || form.tipo === 'SOLICITUD_COMPRA' || form.tipo === 'ORDEN_COMPRA') && (
          <Field label="Vencimiento / requerida">
            <TextInput type="date" value={form.vencimiento} onChange={(e) => actualizar({ vencimiento: e.target.value })} />
          </Field>
        )}
        <Field label="Factura/NCF del proveedor" hint="Solo referencia; el ERP no genera NCF.">
          <TextInput value={form.numeroProveedor} maxLength={60}
            onChange={(e) => actualizar({ numeroProveedor: e.target.value })}
            placeholder="Ej. B0100000001" />
        </Field>
        <Field label="Motivo" className="lg:col-span-2">
          <TextInput value={form.motivo} maxLength={300} onChange={(e) => actualizar({ motivo: e.target.value })}
            placeholder="Motivo de la compra o devolución" />
        </Field>
        <Field label="Comentarios" className="lg:col-span-3">
          <TextInput value={form.comentarios} maxLength={500}
            onChange={(e) => actualizar({ comentarios: e.target.value })}
            placeholder="Observaciones del documento" />
        </Field>
      </div>

      {form.tipo === 'FACTURA_COMPRA' && !conOrigen && (
        <div className="flex gap-2">
          {([false, true] as boolean[]).map((credito) => (
            <button key={String(credito)} onClick={() => actualizar({ credito })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${form.credito === credito
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}>
              {credito ? 'Crédito (CxP)' : 'Contado'}
            </button>
          ))}
        </div>
      )}

      {conOrigen ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
          Se facturarán las líneas {txt(origen?.tipo) === 'RECEPCION' ? 'recibidas' : 'pendientes'} de{' '}
          <strong>{txt(origen?.numero)}</strong>. El sistema evita duplicar stock.
        </p>
      ) : (
        <LineasEditor catalogos={catalogos} lineas={form.lineas}
          onChange={(lineas) => actualizar({ lineas })}
          permitirGasto={form.tipo === 'FACTURA_COMPRA' || form.tipo === 'ORDEN_COMPRA'} />
      )}

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-5">
        <div><p className="text-[11px] text-slate-500">Subtotal</p><p className="font-medium tabular-nums">{money(totales.subtotalCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">Descuento</p><p className="font-medium tabular-nums">{money(totales.descuentoCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">ITBIS</p><p className="font-medium tabular-nums">{money(totales.impuestoCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">Gastos</p><p className="font-medium tabular-nums">{money(totales.gastoCent)}</p></div>
        <div><p className="text-[11px] text-slate-500">Total</p><p className="text-base font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{money(totales.totalCent)}</p></div>
      </div>

      {children}
    </div>
  )
}

/** Editor de cantidades para recepciones y devoluciones. */
export function CantidadesEditor({
  lineas, cantidades, onChange, disponible
}: {
  lineas: Fila[]
  cantidades: Record<number, string>
  onChange: (cantidades: Record<number, string>) => void
  disponible: (linea: Fila) => number
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      {lineas.filter((linea) => disponible(linea) > 0.0000001).map((linea) => (
        <div key={num(linea.id)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{txt(linea.descripcion)}</p>
            <p className="text-xs text-slate-500">Disponible: {number(disponible(linea))}</p>
          </div>
          <TextInput type="text" inputMode="decimal" min="0" step="0.01" className="w-28"
            value={cantidades[num(linea.id)] ?? ''}
            onChange={(e) => onChange({ ...cantidades, [num(linea.id)]: e.target.value })}
            aria-label={`Cantidad de ${txt(linea.descripcion)}`} />
        </div>
      ))}
      {lineas.every((linea) => disponible(linea) <= 0.0000001) && (
        <p className="py-4 text-center text-sm text-slate-400">No hay cantidades pendientes en este documento.</p>
      )}
    </div>
  )
}

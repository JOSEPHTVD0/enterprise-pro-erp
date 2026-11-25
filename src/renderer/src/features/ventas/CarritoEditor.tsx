import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { money } from '@/lib/format'
import { nuevaLinea, totalesCarrito, impuestoPorDefecto } from './carrito'
import type { CatalogosVentas, LineaCarrito } from './types'

interface Props {
  catalogos: CatalogosVentas
  lineas: LineaCarrito[]
  onChange: (lineas: LineaCarrito[]) => void
  permitirDescuento?: boolean
  permitirPrecio?: boolean
}

/** Editor de líneas reutilizado por facturación, POS, cotizaciones y pedidos. */
export function CarritoEditor({
  catalogos, lineas, onChange, permitirDescuento = true, permitirPrecio = true
}: Props): React.JSX.Element {
  function actualizar(key: string, cambios: Partial<LineaCarrito>): void {
    onChange(lineas.map((linea) => linea.key === key ? { ...linea, ...cambios } : linea))
  }

  function elegirProducto(linea: LineaCarrito, productoId: string): void {
    const producto = catalogos.productos.find((p) => String(p.id) === productoId)
    actualizar(linea.key, {
      productoId,
      precioCent: producto ? (Number(producto.precio1Cent) / 100).toFixed(2) : '0.00',
      impuestoId: producto?.impuestoId
        ? String(producto.impuestoId)
        : (impuestoPorDefecto(catalogos)?.toString() ?? '')
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
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2">Producto</th>
              <th className="w-20 px-2 py-2">Cant.</th>
              <th className="w-28 px-2 py-2">Precio RD$</th>
              <th className="w-20 px-2 py-2">Desc. %</th>
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
                    <input
                      className={`${inputClass} h-8 px-2`}
                      type="text" inputMode="decimal" min="0.0001" step="0.01"
                      value={linea.cantidad}
                      onChange={(e) => actualizar(linea.key, { cantidad: e.target.value })}
                      aria-label="Cantidad"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputClass} h-8 px-2`}
                      type="text" inputMode="decimal" min="0" step="0.01"
                      disabled={!permitirPrecio}
                      value={linea.precioCent}
                      onChange={(e) => actualizar(linea.key, { precioCent: e.target.value })}
                      aria-label="Precio"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputClass} h-8 px-2`}
                      type="text" inputMode="decimal" min="0" max="100" step="0.01"
                      disabled={!permitirDescuento}
                      value={linea.descuentoPct}
                      onChange={(e) => actualizar(linea.key, { descuentoPct: e.target.value })}
                      aria-label="Descuento porcentual"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className={`${inputClass} h-8`}
                      value={linea.impuestoId}
                      onChange={(e) => actualizar(linea.key, { impuestoId: e.target.value })}
                      aria-label="Impuesto"
                    >
                      <option value="">Sin impuesto</option>
                      {catalogos.impuestos.map((i) => (
                        <option key={i.id} value={i.id}>{i.codigo} · {Number(i.tasaBp) / 100}%</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={linea.exento}
                      onChange={(e) => actualizar(linea.key, { exento: e.target.checked })}
                      aria-label="Exento"
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputClass} h-8 px-2`}
                      placeholder={producto?.manejaSerie ? 'Serie obligatoria' : 'Serie'}
                      value={linea.numeroSerie}
                      onChange={(e) => actualizar(linea.key, { numeroSerie: e.target.value })}
                      aria-label="Número de serie"
                    />
                    <input
                      className={`${inputClass} mt-1 h-8 px-2`}
                      placeholder={producto?.manejaLote ? 'Lote obligatorio' : 'Lote'}
                      value={linea.lote}
                      onChange={(e) => actualizar(linea.key, { lote: e.target.value })}
                      aria-label="Lote"
                    />
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
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                  Agregue al menos una línea para continuar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

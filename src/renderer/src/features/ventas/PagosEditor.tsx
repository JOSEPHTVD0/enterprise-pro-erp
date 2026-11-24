import { Plus, Trash2 } from 'lucide-react'
import { centavosDesdeDecimal } from '@shared/dinero'
import { calcularCambio } from '@shared/impuestos'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { money } from '@/lib/format'
import { clave, metodosPago, type MetodoPago, type PagoForm } from './types'

interface Props {
  totalCent: number
  pagos: PagoForm[]
  onChange: (pagos: PagoForm[]) => void
}

/** Pagos combinados. El backend exige que la suma cuadre exactamente con el total. */
export function PagosEditor({ totalCent, pagos, onChange }: Props): React.JSX.Element {
  const pagadoCent = pagos.reduce(
    (suma, pago) => suma + centavosDesdeDecimal(Number(pago.monto) || 0), 0
  )
  const cambio = calcularCambio(totalCent, pagadoCent)
  const pendienteCent = totalCent - pagadoCent

  function actualizar(key: string, cambios: Partial<PagoForm>): void {
    onChange(pagos.map((pago) => pago.key === key ? { ...pago, ...cambios } : pago))
  }

  function completarResto(): void {
    if (!pagos.length || pendienteCent <= 0) return
    actualizar(pagos[0].key, { monto: (pendienteCent / 100).toFixed(2) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pagos</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={completarResto} disabled={pendienteCent <= 0}>
            Completar resto
          </Button>
          <Button
            size="sm" variant="secondary"
            onClick={() => onChange([...pagos, { key: clave(), metodo: 'EFECTIVO', monto: '', referencia: '' }])}
          >
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
                  <select
                    className={`${inputClass} h-8`}
                    value={pago.metodo}
                    onChange={(e) => actualizar(pago.key, { metodo: e.target.value as MetodoPago })}
                    aria-label="Método de pago"
                  >
                    {metodosPago.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className={`${inputClass} h-8 px-2`}
                    type="number" min="0" step="0.01"
                    value={pago.monto}
                    onChange={(e) => actualizar(pago.key, { monto: e.target.value })}
                    aria-label="Monto del pago"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className={`${inputClass} h-8 px-2`}
                    value={pago.referencia}
                    onChange={(e) => actualizar(pago.key, { referencia: e.target.value })}
                    placeholder="Opcional"
                    aria-label="Referencia"
                  />
                </td>
                <td className="px-1 py-1.5">
                  <button
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                    onClick={() => onChange(pagos.filter((p) => p.key !== pago.key))}
                    aria-label="Quitar pago"
                  >
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
        <span className="text-slate-500">Total: <strong className="text-slate-700 dark:text-slate-200">{money(totalCent)}</strong></span>
        <span className="text-slate-500">Pagado: <strong className="text-slate-700 dark:text-slate-200">{money(pagadoCent)}</strong></span>
        <span className="text-slate-500">Cambio: <strong className="text-emerald-600">{money(cambio)}</strong></span>
        {pendienteCent !== 0 && (
          <span className={pendienteCent > 0 ? 'text-amber-600' : 'text-red-600'}>
            {pendienteCent > 0 ? 'Falta' : 'Sobra'}: {money(Math.abs(pendienteCent))}
          </span>
        )}
      </div>
    </div>
  )
}

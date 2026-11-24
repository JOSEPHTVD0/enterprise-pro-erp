import { Printer } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { money, number } from '@/lib/format'
import { num, txt, type DetalleDocumento } from './types'

const estados: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVO: 'success', CONTABILIZADO: 'success', PENDIENTE: 'warning', APROBADA: 'info',
  CONVERTIDA: 'info', ANULADO: 'danger', VENCIDA: 'danger'
}

export function DocumentoDetalle({
  detalle, onClose, onPrint, puedeImprimir
}: {
  detalle: DetalleDocumento | null
  onClose: () => void
  onPrint?: () => void
  puedeImprimir?: boolean
}): React.JSX.Element | null {
  if (!detalle) return null
  const { cabecera, lineas, pagos } = detalle
  const estado = txt(cabecera.estado)

  return (
    <Modal
      open
      title={`Documento ${txt(cabecera.numero)}`}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          {puedeImprimir && onPrint && (
            <Button variant="secondary" onClick={onPrint}><Printer size={14} /> Imprimir</Button>
          )}
          <Button onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800 sm:grid-cols-3">
          <div><p className="text-slate-500">Tipo</p><p className="font-medium">{txt(cabecera.tipo)}</p></div>
          <div><p className="text-slate-500">Fecha</p><p className="font-medium">{txt(cabecera.fecha)}</p></div>
          <div><p className="text-slate-500">Estado</p><Badge tone={estados[estado] ?? 'neutral'}>{estado}</Badge></div>
          <div><p className="text-slate-500">Cliente</p><p className="font-medium">{txt(cabecera.clienteNombre)}</p></div>
          <div><p className="text-slate-500">RNC/Cédula</p><p className="font-medium">{txt(cabecera.clienteRnc) || '—'}</p></div>
          <div><p className="text-slate-500">Condición</p><p className="font-medium">{txt(cabecera.condicion)}</p></div>
          {num(cabecera.esNcf) === 1 && <div className="sm:col-span-3"><p className="text-slate-500">NCF</p><p className="font-medium">{txt(cabecera.numero)}</p></div>}
          {txt(cabecera.comentarios) && <div className="sm:col-span-3"><p className="text-slate-500">Comentarios</p><p>{txt(cabecera.comentarios)}</p></div>}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Cant.</th>
                <th className="px-2 py-2">Precio</th>
                <th className="px-2 py-2">Dto.</th>
                <th className="px-2 py-2">ITBIS</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lineas.map((linea) => (
                <tr key={num(linea.id)}>
                  <td className="px-2 py-2">
                    {txt(linea.descripcion)}
                    {(txt(linea.numeroSerie) || txt(linea.lote)) && (
                      <p className="text-[10px] text-slate-400">
                        {[txt(linea.numeroSerie) && `Serie ${txt(linea.numeroSerie)}`, txt(linea.lote) && `Lote ${txt(linea.lote)}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{number(linea.cantidad)}</td>
                  <td className="px-2 py-2 tabular-nums">{money(num(linea.precioCent))}</td>
                  <td className="px-2 py-2 tabular-nums">{money(num(linea.descuentoCent))}</td>
                  <td className="px-2 py-2 tabular-nums">{money(num(linea.impuestoCent))}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{money(num(linea.totalCent))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-xs space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(num(cabecera.subtotalCent))}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Descuento</span><span className="tabular-nums">-{money(num(cabecera.descuentoCent))}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ITBIS</span><span className="tabular-nums">{money(num(cabecera.impuestoCent))}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold dark:border-slate-700">
            <span>Total</span><span className="tabular-nums">{money(num(cabecera.totalCent))}</span>
          </div>
        </div>

        {pagos.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Pagos registrados</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr><th className="px-2 py-2">Método</th><th className="px-2 py-2">Referencia</th><th className="px-2 py-2 text-right">Monto</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagos.map((pago) => (
                    <tr key={num(pago.id)}>
                      <td className="px-2 py-1.5">{txt(pago.metodo)}</td>
                      <td className="px-2 py-1.5">{txt(pago.referencia) || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{money(num(pago.montoCent))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

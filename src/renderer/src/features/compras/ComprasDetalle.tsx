import { Printer } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { money, number } from '@/lib/format'
import { etiquetasTipo, num, txt, type DatosImpresionCompra, type DetalleCompra } from './types'

const tonos: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDIENTE: 'warning', APROBADA: 'info', PARCIAL: 'warning', COMPLETO: 'success',
  CONTABILIZADO: 'success', CONVERTIDA: 'info', ANULADO: 'danger'
}

export function DetalleCompra({
  detalle, onClose, onPrint, puedeImprimir
}: {
  detalle: DetalleCompra | null
  onClose: () => void
  onPrint?: () => void
  puedeImprimir?: boolean
}): React.JSX.Element | null {
  if (!detalle) return null
  const { cabecera, lineas, pagos } = detalle

  return (
    <Modal
      open
      title={`${etiquetasTipo[txt(cabecera.tipo)] ?? txt(cabecera.tipo)} ${txt(cabecera.numero)}`}
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {puedeImprimir && onPrint && <Button onClick={onPrint}><Printer size={14} /> Imprimir</Button>}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={tonos[txt(cabecera.estado)] ?? 'neutral'}>{txt(cabecera.estado)}</Badge>
        <span>Fecha: <strong>{txt(cabecera.fecha)}</strong></span>
        <span>Condición: <strong>{txt(cabecera.condicion)}</strong></span>
        {txt(cabecera.numeroProveedor) && (
          <span>Factura/NCF proveedor: <strong>{txt(cabecera.numeroProveedor)}</strong></span>
        )}
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800 sm:grid-cols-3">
        <div><p className="text-[11px] text-slate-500">Proveedor</p><p className="font-medium">{txt(cabecera.proveedorNombre)}</p></div>
        <div><p className="text-[11px] text-slate-500">RNC</p><p>{txt(cabecera.proveedorRnc) || '—'}</p></div>
        <div><p className="text-[11px] text-slate-500">Vencimiento</p><p>{txt(cabecera.vencimiento) || '—'}</p></div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2">Producto</th>
              <th className="px-2 py-2">Cant.</th>
              <th className="px-2 py-2">Recibida</th>
              <th className="px-2 py-2">Devuelta</th>
              <th className="px-2 py-2">Costo</th>
              <th className="px-2 py-2">ITBIS</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineas.map((linea) => (
              <tr key={num(linea.id)}>
                <td className="px-2 py-2">
                  <p className="font-medium">{txt(linea.descripcion)}</p>
                  {txt(linea.numeroSerie) && <p className="text-slate-500">Serie: {txt(linea.numeroSerie)}</p>}
                  {txt(linea.lote) && <p className="text-slate-500">Lote: {txt(linea.lote)}</p>}
                </td>
                <td className="px-2 py-2">{number(linea.cantidad)}</td>
                <td className="px-2 py-2">{number(linea.cantidadRecibida)}</td>
                <td className="px-2 py-2">{number(linea.cantidadDevuelta)}</td>
                <td className="px-2 py-2">{money(num(linea.costoUnitCent))}</td>
                <td className="px-2 py-2">{money(num(linea.impuestoCent))}</td>
                <td className="px-2 py-2 text-right font-medium tabular-nums">{money(num(linea.totalCent))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto mt-3 w-full max-w-[280px] text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(num(cabecera.subtotalCent))}</span></div>
        <div className="flex justify-between"><span>Descuento</span><span>-{money(num(cabecera.descuentoCent))}</span></div>
        <div className="flex justify-between"><span>ITBIS</span><span>{money(num(cabecera.impuestoCent))}</span></div>
        <div className="flex justify-between"><span>Gastos</span><span>{money(num(cabecera.gastoCent))}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1 font-bold dark:border-slate-700">
          <span>Total</span><span>{money(num(cabecera.totalCent))}</span>
        </div>
      </div>

      {pagos.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-slate-500">Pagos</p>
          {pagos.map((pago) => (
            <div key={num(pago.id)} className="flex justify-between text-sm">
              <span>{txt(pago.metodo)}{txt(pago.referencia) ? ` · ${txt(pago.referencia)}` : ''}</span>
              <span>{money(num(pago.montoCent))}</span>
            </div>
          ))}
        </div>
      )}
      {txt(cabecera.motivo) && <p className="mt-4 text-xs text-slate-500">Motivo: {txt(cabecera.motivo)}</p>}
    </Modal>
  )
}

/**
 * Área de impresión nativa de Electron (`window.print()` → webContents.print).
 * No genera PDF por librería: usa el motor de impresión del sistema.
 */
export function AreaImpresionCompra({ datos }: { datos: DatosImpresionCompra | null }): React.JSX.Element | null {
  if (!datos) return null
  const { empresa, documento, lineas, pagos } = datos

  return (
    <div className="print-area" aria-hidden="true">
      <div className="mx-auto max-w-[700px] p-6 text-sm">
        <div className="mb-4 text-center">
          <p className="text-lg font-bold uppercase">{txt(empresa.nombreComercial) || 'EMPRESA'}</p>
          <p>{txt(empresa.razonSocial)}</p>
          <p>RNC: {txt(empresa.rnc) || '—'} · {txt(empresa.direccion)}</p>
        </div>

        <div className="mb-3 flex justify-between border-y border-black py-2">
          <div>
            <p className="font-semibold">{etiquetasTipo[txt(documento.tipo)] ?? txt(documento.tipo)}</p>
            <p>{txt(documento.numero)}</p>
          </div>
          <div className="text-right">
            <p>{txt(documento.fecha)}</p>
            <p>{txt(documento.condicion)}</p>
          </div>
        </div>

        <div className="mb-3">
          <p>Proveedor: {txt(documento.proveedorNombre)}</p>
          <p>RNC: {txt(documento.proveedorRnc) || '—'}</p>
          <p>Factura/NCF del proveedor: {txt(documento.numeroProveedor) || '—'}</p>
          {txt(documento.vencimiento) && <p>Vencimiento: {txt(documento.vencimiento)}</p>}
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black">
              <th>Descripción</th><th>Cant.</th><th>Costo</th><th>ITBIS</th><th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea) => (
              <tr key={num(linea.id)} className="border-b border-slate-400">
                <td>{txt(linea.descripcion)}</td>
                <td>{number(linea.cantidad)}</td>
                <td>{money(num(linea.costoUnitCent))}</td>
                <td>{money(num(linea.impuestoCent))}</td>
                <td className="text-right">{money(num(linea.totalCent))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-3 w-full max-w-[240px]">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(num(documento.subtotalCent))}</span></div>
          <div className="flex justify-between"><span>Descuento</span><span>-{money(num(documento.descuentoCent))}</span></div>
          <div className="flex justify-between"><span>ITBIS</span><span>{money(num(documento.impuestoCent))}</span></div>
          <div className="flex justify-between"><span>Gastos</span><span>{money(num(documento.gastoCent))}</span></div>
          <div className="flex justify-between border-t border-black pt-1 font-bold">
            <span>Total</span><span>{money(num(documento.totalCent))}</span>
          </div>
        </div>

        {pagos.length > 0 && (
          <div className="mt-3">
            <p className="font-semibold">Pagos</p>
            {pagos.map((pago) => (
              <div key={num(pago.id)} className="flex justify-between">
                <span>{txt(pago.metodo)}{txt(pago.referencia) ? ` · ${txt(pago.referencia)}` : ''}</span>
                <span>{money(num(pago.montoCent))}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[10px]">
          Documento generado por ENTERPRISE PRO ERP · NCF del proveedor solo como referencia · Sin certificación DGII
        </p>
      </div>
    </div>
  )
}

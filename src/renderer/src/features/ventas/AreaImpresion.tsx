import { money, number } from '@/lib/format'
import { num, txt, type DatosImpresion } from './types'

/**
 * Área de impresión nativa de Electron (`webContents.print` vía IPC seguro).
 * No genera PDF por librería: usa el motor de impresión del sistema.
 */
export function AreaImpresion({ datos }: { datos: DatosImpresion | null }): React.JSX.Element | null {
  if (!datos) return null
  const { empresa, documento, lineas, pagos } = datos
  const ticket = datos.formato.startsWith('TICKET')

  return (
    <div className="print-area" aria-hidden="true">
      <div className={ticket ? 'mx-auto max-w-[80mm] p-2 text-[11px]' : 'mx-auto max-w-[700px] p-6 text-sm'}>
        <div className="mb-4 text-center">
          <p className="text-lg font-bold uppercase">{txt(empresa.nombreComercial) || 'EMPRESA'}</p>
          <p>{txt(empresa.razonSocial)}</p>
          <p>RNC: {txt(empresa.rnc) || '—'} · {txt(empresa.direccion)}</p>
        </div>

        <div className="mb-3 flex justify-between border-y border-black py-2">
          <div>
            <p className="font-semibold">{txt(documento.tipo)}</p>
            <p>{txt(documento.numero)}{num(documento.esNcf) === 1 ? ' (NCF)' : ''}</p>
          </div>
          <div className="text-right">
            <p>{txt(documento.fecha)}</p>
            <p>{txt(documento.condicion)}</p>
          </div>
        </div>

        <div className="mb-3">
          <p>Cliente: {txt(documento.clienteNombre)}</p>
          <p>RNC/Cédula: {txt(documento.clienteRnc) || '—'}</p>
          {txt(documento.vencimiento) && <p>Vencimiento: {txt(documento.vencimiento)}</p>}
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black">
              <th>Descripción</th><th>Cant.</th><th>Precio</th><th>ITBIS</th><th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea) => (
              <tr key={num(linea.id)} className="border-b border-slate-400">
                <td>{txt(linea.descripcion)}</td>
                <td>{number(linea.cantidad)}</td>
                <td>{money(num(linea.precioCent))}</td>
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

        <p className="mt-6 text-center text-[10px]">Documento generado por ENTERPRISE PRO ERP · Uso local</p>
      </div>
    </div>
  )
}

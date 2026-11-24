import { money } from '@/lib/format'
import { num, txt, type DatosImpresionFinanzas, type Fila } from './types'

/** Rotula una clave técnica del backend para el comprobante impreso. */
function rotulo(clave: string): string {
  return clave.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

function valor(clave: string, dato: unknown): string {
  if (/cent$/i.test(clave)) return money(num(dato))
  return txt(dato) || '—'
}

/**
 * Área de impresión nativa de Electron (`window.print()` → webContents.print).
 * No genera PDF por librería: usa el motor de impresión del sistema.
 */
export function AreaImpresionFinanzas({
  datos
}: {
  datos: DatosImpresionFinanzas | null
}): React.JSX.Element | null {
  if (!datos) return null
  const ticket = txt(datos.formato).startsWith('TICKET')
  const { empresa, documento, lineas } = datos
  const columnas = Array.from(new Set(lineas.flatMap((linea) => Object.keys(linea)))).slice(0, 8)
  const campos = Object.entries(documento).filter(([clave]) => !clave.startsWith('_')).slice(0, 18)

  return (
    <div className="print-area" aria-hidden="true">
      <div className={ticket ? 'mx-auto max-w-[80mm] p-2 text-[11px]' : 'mx-auto max-w-[700px] p-6 text-sm'}>
        <div className="mb-4 text-center">
          <p className="text-lg font-bold uppercase">{txt(empresa.nombreComercial) || 'EMPRESA'}</p>
          {txt(empresa.razonSocial) && <p>{txt(empresa.razonSocial)}</p>}
          <p>RNC: {txt(empresa.rnc) || '—'}</p>
          {txt(empresa.direccion) && <p>{txt(empresa.direccion)}</p>}
        </div>

        <div className="mb-3 border-y border-black py-2">
          {campos.map(([clave, dato]) => (
            <div key={clave} className="flex justify-between gap-4">
              <span>{rotulo(clave)}:</span>
              <span className="text-right font-medium">{valor(clave, dato)}</span>
            </div>
          ))}
        </div>

        {lineas.length > 0 && (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black">
                {columnas.map((columna) => <th key={columna}>{rotulo(columna)}</th>)}
              </tr>
            </thead>
            <tbody>
              {lineas.map((linea: Fila, indice: number) => (
                <tr key={num(linea.id) || indice} className="border-b border-slate-400">
                  {columnas.map((columna) => (
                    <td key={columna}>{valor(columna, linea[columna])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-6 text-center text-[10px]">
          Documento generado por ENTERPRISE PRO ERP · Uso local · Formato {txt(datos.formato)}
        </p>
      </div>
    </div>
  )
}

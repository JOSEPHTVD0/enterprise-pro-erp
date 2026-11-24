import { money } from '@/lib/format'
import { num, txt, type DatosImpresionReporte } from './types'

function valor(clave: string, dato: unknown): string {
  if (clave.endsWith('Cent')) return money(num(dato))
  return txt(dato) || '—'
}

/** Impresión nativa de Electron: el canal solo entrega datos, nunca rutas ni PDF. */
export function AreaImpresionReportes({ datos }: { datos: DatosImpresionReporte | null }): React.JSX.Element | null {
  if (!datos) return null
  const columnas = datos.columnas.slice(0, 10)
  const filas = datos.filas.slice(0, 200)
  const empresa = datos.empresa

  return (
    <div className="print-area" aria-hidden="true">
      <div className="mx-auto max-w-[1000px] p-6 text-[11px]">
        <div className="mb-4 text-center">
          <p className="text-lg font-bold uppercase">{txt(empresa.nombre_comercial) || 'EMPRESA'}</p>
          {txt(empresa.razon_social) && <p>{txt(empresa.razon_social)}</p>}
          <p>RNC: {txt(empresa.rnc) || '—'}</p>
        </div>

        <h2 className="mb-2 text-center text-base font-semibold uppercase">{datos.titulo}</h2>
        <p className="mb-3 text-center text-[10px]">
          Desde {txt(datos.filtro.fechaDesde) || 'inicio'} · Hasta {txt(datos.filtro.fechaHasta) || 'hoy'} ·
          {' '}{datos.registros} registro(s)
        </p>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-black">
              {columnas.map((columna) => (
                <th key={columna.key} className="px-1 py-1 font-semibold">{columna.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, indice) => (
              <tr key={`${txt(fila.numero ?? claveFila(fila))}-${indice}`} className="border-b border-slate-400">
                {columnas.map((columna) => (
                  <td key={columna.key} className="px-1 py-0.5">{valor(columna.key, fila[columna.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-semibold">
              {columnas.map((columna, indice) => (
                <td key={columna.key} className="px-1 py-1">
                  {indice === 0 ? 'TOTALES' : columna.key.endsWith('Cent') ? money(num(datos.totales[columna.key])) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>

        {datos.filas.length > filas.length && (
          <p className="mt-2 text-[10px]">
            Se imprimen las primeras {filas.length} filas de {datos.registros}. Use Excel/CSV para el detalle completo.
          </p>
        )}

        <p className="mt-5 text-center text-[10px]">{datos.aviso}</p>
        <p className="mt-1 text-center text-[9px]">
          Generado por ENTERPRISE PRO ERP · {new Date(datos.generadoEn).toLocaleString('es-DO')}
        </p>
      </div>
    </div>
  )
}

function claveFila(fila: Record<string, string | number>): string {
  return txt(fila.fecha ?? fila.numeroDocumento ?? fila.codigo ?? '')
}

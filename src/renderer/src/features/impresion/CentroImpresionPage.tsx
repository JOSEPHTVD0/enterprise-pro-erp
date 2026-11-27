import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { CheckCircle2, Printer, RefreshCw } from 'lucide-react'
import type { ImpresoraInfo } from '@shared/schemas/impresion'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SelectorImpresora } from '@/components/impresion/SelectorImpresora'
import { Field, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/Toast'
import { money, number } from '@/lib/format'
import { formatoGuardado, normalizarFormato, type FormatoImpresion } from '@/lib/formato-impresion'
import {
  imprimirDocumento, imprimirPrueba, listarImpresoras
} from '@/lib/impresion'
import { AreaImpresion } from '@/features/ventas/AreaImpresion'
import { num, txt, type DatosImpresion } from '@/features/ventas/types'
import { AreaImpresionCompra } from '@/features/compras/ComprasDetalle'
import type { DatosImpresionCompra } from '@/features/compras/types'
import { AreaImpresionFinanzas } from '@/features/finanzas/AreaImpresionFinanzas'
import type { DatosImpresionFinanzas, Fila } from '@/features/finanzas/types'

type TipoArea = 'venta' | 'compra' | 'finanzas'
type TipoComprobante = 'DOCUMENTO' | 'RECIBO' | 'PAGO' | undefined

interface Fuente {
  id: string
  label: string
  listado: string
  impresion: string
  consultar: string
  imprimir: string
  area: TipoArea
  tipoDoc: string
  tipo?: TipoComprobante
}

const fuentes: Fuente[] = [
  {
    id: 'ventas', label: 'Ventas y facturación', listado: 'ventas.documentos',
    impresion: 'ventas.imprimir.datos', consultar: 'ventas.consultar', imprimir: 'ventas.imprimir',
    area: 'venta', tipoDoc: 'FACTURA'
  },
  {
    id: 'compras', label: 'Compras', listado: 'compras.documentos',
    impresion: 'compras.imprimir.datos', consultar: 'compras.consultar', imprimir: 'compras.imprimir',
    area: 'compra', tipoDoc: 'COMPRA'
  },
  {
    id: 'cobros', label: 'Cobros', listado: 'cobros.documentos',
    impresion: 'cobros.imprimir', consultar: 'cobros.consultar', imprimir: 'cobros.imprimir',
    area: 'finanzas', tipoDoc: 'COBRO', tipo: 'DOCUMENTO'
  },
  {
    id: 'cobros-recibos', label: 'Recibos y anticipos', listado: 'cobros.recibos',
    impresion: 'cobros.imprimir', consultar: 'cobros.consultar', imprimir: 'cobros.imprimir',
    area: 'finanzas', tipoDoc: 'RECIBO', tipo: 'RECIBO'
  },
  {
    id: 'cxc', label: 'CxC — documentos', listado: 'cxc.documentos',
    impresion: 'cxc.imprimir.datos', consultar: 'cxc.consultar', imprimir: 'cxc.imprimir',
    area: 'finanzas', tipoDoc: 'COBRO', tipo: 'DOCUMENTO'
  },
  {
    id: 'cxc-recibos', label: 'CxC — recibos', listado: 'cxc.recibos',
    impresion: 'cxc.imprimir.datos', consultar: 'cxc.consultar', imprimir: 'cxc.imprimir',
    area: 'finanzas', tipoDoc: 'RECIBO', tipo: 'RECIBO'
  },
  {
    id: 'cxp', label: 'CxP — documentos', listado: 'cxp.documentos',
    impresion: 'cxp.imprimir.datos', consultar: 'cxp.consultar', imprimir: 'cxp.imprimir',
    area: 'finanzas', tipoDoc: 'CXP', tipo: 'DOCUMENTO'
  },
  {
    id: 'cxp-pagos', label: 'CxP — pagos', listado: 'cxp.pagos',
    impresion: 'cxp.imprimir.datos', consultar: 'cxp.consultar', imprimir: 'cxp.imprimir',
    area: 'finanzas', tipoDoc: 'CXP', tipo: 'PAGO'
  },
  {
    id: 'bancos', label: 'Bancos', listado: 'bancos.movimientos',
    impresion: 'bancos.imprimir.datos', consultar: 'bancos.consultar', imprimir: 'bancos.imprimir',
    area: 'finanzas', tipoDoc: 'BANCO'
  },
  {
    id: 'cajas', label: 'Cajas', listado: 'cajas.sesiones',
    impresion: 'cajas.imprimir.datos', consultar: 'cajas.consultar', imprimir: 'cajas.imprimir',
    area: 'finanzas', tipoDoc: 'CAJA'
  }
]

interface AreaDatos {
  venta: DatosImpresion | null
  compra: DatosImpresionCompra | null
  finanzas: DatosImpresionFinanzas | null
}

const vacio: AreaDatos = { venta: null, compra: null, finanzas: null }

/** Centro operativo de impresión: todos los datos siguen viniendo de sus canales reales. */
export function CentroImpresionPage(): React.JSX.Element {
  const [fuenteId, setFuenteId] = useState(fuentes[0].id)
  const [filas, setFilas] = useState<Fila[]>([])
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [impresoras, setImpresoras] = useState<ImpresoraInfo[]>([])
  const [detectando, setDetectando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState<{ impresos: number; total: number } | null>(null)
  const [impresora, setImpresora] = useState('')
  const [areas, setAreas] = useState<AreaDatos>(vacio)

  const fuente = useMemo(
    () => fuentes.find((item) => item.id === fuenteId) ?? fuentes[0],
    [fuenteId]
  )
  const puedeListar = can(fuente.consultar)
  const puedeImprimir = can(fuente.imprimir)

  const detectar = useCallback(async (): Promise<void> => {
    setDetectando(true)
    try {
      setImpresoras(await listarImpresoras())
    } finally {
      setDetectando(false)
    }
  }, [])

  useEffect(() => { void detectar() }, [detectar])

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    setSeleccion([])
    setProgreso(null)
    if (!puedeListar) {
      setFilas([])
      setCargando(false)
      return
    }
    try {
      const datos = await window.api.invoke<Fila[]>(fuente.listado, { limite: 200 })
      setFilas(Array.isArray(datos) ? datos : [])
    } catch (error) {
      toast.error(errorInfo(error).message)
      setFilas([])
    } finally {
      setCargando(false)
    }
  }, [fuente.listado, puedeListar])

  useEffect(() => { void cargar() }, [cargar])

  async function preparar(fila: Fila): Promise<void> {
    const formato = normalizarFormato(
      await formatoGuardado(txt(fila.tipoDoc ?? fila.tipo ?? fuente.tipoDoc)),
      'CARTA'
    )
    const base = { id: num(fila.id), formato }
    const datos = await window.api.invoke<unknown>(
      fuente.impresion,
      fuente.tipo ? { ...base, tipo: fuente.tipo } : base
    )
    // Forzar el render evita imprimir el documento anterior en lotes rápidos.
    flushSync(() => setAreas({
      venta: fuente.area === 'venta' ? datos as DatosImpresion : null,
      compra: fuente.area === 'compra' ? datos as DatosImpresionCompra : null,
      finanzas: fuente.area === 'finanzas' ? datos as DatosImpresionFinanzas : null
    }))
  }

  async function imprimir(fila: Fila, formato: FormatoImpresion): Promise<boolean> {
    await preparar(fila)
    return imprimirDocumento(fuente.tipoDoc, { formato, impresora })
  }

  async function imprimirUno(fila: Fila): Promise<void> {
    try {
      const formato = normalizarFormato(
        await formatoGuardado(txt(fila.tipoDoc ?? fila.tipo ?? fuente.tipoDoc)), 'CARTA'
      )
      if (await imprimir(fila, formato)) toast.success('Documento enviado a la impresora.')
      else toast.warning('La impresión fue cancelada.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function imprimirSeleccionados(): Promise<void> {
    const documentos = filas.filter((fila) => seleccion.includes(num(fila.id)))
    if (!documentos.length) { toast.warning('Seleccione al menos un documento.'); return }
    setProcesando(true)
    setProgreso({ impresos: 0, total: documentos.length })
    try {
      let impresos = 0
      for (const [indice, fila] of documentos.entries()) {
        const formato = normalizarFormato(
          await formatoGuardado(txt(fila.tipoDoc ?? fila.tipo ?? fuente.tipoDoc)), 'CARTA'
        )
        if (await imprimir(fila, formato)) impresos += 1
        setProgreso({ impresos, total: indice + 1 })
      }
      setProgreso(null)
      toast.success(`${impresos} de ${documentos.length} documento(s) impresos.`)
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function probar(): Promise<void> {
    setProcesando(true)
    try {
      const ok = await imprimirPrueba({ impresora })
      if (ok) toast.success('Prueba de impresión enviada.')
      else toast.warning('La prueba fue cancelada.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  function alternar(id: number): void {
    setSeleccion((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Centro de impresión"
        subtitle="Impresoras del equipo, configuración por documento e impresión de lotes desde datos reales."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void detectar()} disabled={detectando}>
              <RefreshCw size={14} className={detectando ? 'animate-spin' : ''} /> Detectar impresoras
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void probar()} disabled={procesando}>
              <Printer size={14} /> Imprimir prueba
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Impresoras detectadas" subtitle="Nombre real informado por Windows.">
          {impresoras.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {detectando ? 'Detectando impresoras…' : 'No hay impresoras disponibles en este equipo.'}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {impresoras.map((item) => (
                <li key={item.name} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  <div>
                    <p className="font-medium">{item.displayName || item.name}</p>
                    <p className="text-[11px] text-slate-400">{item.name}</p>
                  </div>
                  {item.isDefault && <Badge tone="info">Predeterminada</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Impresora de esta sesión" subtitle="Prevalece sobre la preferida en el documento seleccionado.">
          <SelectorImpresora
            value={impresora}
            impresoras={impresoras}
            detectando={detectando}
            onDetectar={() => void detectar()}
            onChange={setImpresora}
            label="Impresora"
          />
          <p className="mt-3 text-xs text-slate-400">
            Vacía = usa la impresora configurada para el tipo de documento o la del sistema.
          </p>
          {progreso && (
            <p className="mt-3 text-xs text-indigo-600 dark:text-indigo-400">
              Imprimiendo {progreso.impresos} de {progreso.total}…
            </p>
          )}
        </Card>

        <Card title="Origen de documentos" subtitle="Cada origen conserva sus permisos y validaciones.">
          <Field label="Módulo">
            <select className={inputClass} value={fuenteId} onChange={(e) => setFuenteId(e.target.value)}>
              {fuentes.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={puedeListar ? 'success' : 'danger'}>Consultar</Badge>
            <Badge tone={puedeImprimir ? 'success' : 'danger'}>Imprimir</Badge>
          </div>
        </Card>
      </div>

      <Card
        title={`Documentos — ${fuente.label}`}
        subtitle="Seleccione uno o varios comprobantes para enviarlos a impresión."
        actions={
          <Button size="sm" onClick={() => void imprimirSeleccionados()}
            disabled={!puedeImprimir || procesando || seleccion.length === 0}>
            <CheckCircle2 size={14} /> Imprimir lote ({seleccion.length})
          </Button>
        }
        className="mt-4"
      >
        {!puedeListar ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Su perfil no tiene permiso para consultar este módulo.
          </p>
        ) : cargando ? (
          <p className="text-sm text-slate-500">Cargando documentos…</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-slate-500">No hay documentos para imprimir.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">×</th>
                  <th className="px-3 py-2">Número</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Identidad</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filas.map((fila) => {
                  const id = num(fila.id)
                  return (
                    <tr key={id}>
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-indigo-600"
                          aria-label={`Seleccionar documento ${num(fila.id)}`}
                          checked={seleccion.includes(id)} onChange={() => alternar(id)} />
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {txt(fila.numeroDocumento) || txt(fila.numero) || `#${id}`}
                      </td>
                      <td className="px-3 py-2">{txt(fila.fecha) || '—'}</td>
                      <td className="px-3 py-2">
                        {txt(fila.clienteNombre) || txt(fila.proveedorNombre) || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(num(fila.totalCent ?? fila.montoCent))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="secondary" size="sm"
                          disabled={!puedeImprimir || procesando}
                          onClick={() => void imprimirUno(fila)}>
                          <Printer size={13} /> Imprimir
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="sr-only" aria-live="polite">
          ${number(seleccion.length)} seleccionados
        </div>
      </Card>

      <div className="print-zone">
        {areas.venta && <AreaImpresion datos={areas.venta} />}
        {areas.compra && <AreaImpresionCompra datos={areas.compra} />}
        {areas.finanzas && <AreaImpresionFinanzas datos={areas.finanzas} />}
      </div>
    </div>
  )
}

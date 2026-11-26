import { useCallback, useEffect, useState } from 'react'
import { Eye, History, RefreshCw } from 'lucide-react'
import { errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'
import { num, txt, type Fila } from './types'

interface Historial {
  documentos: Fila[]
  versiones: Fila[]
  reimpresiones: Fila[]
  auditoria: Fila[]
  asientos: Fila[]
}

const tonos: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDIENTE: 'warning', APROBADA: 'info', PARCIAL: 'warning', COMPLETO: 'success',
  CONTABILIZADO: 'success', CONVERTIDA: 'info', ANULADO: 'danger'
}

/** Historial real del ingreso: versiones, reimpresiones, auditoría y asientos. */
export function HistorialIngresos(): React.JSX.Element {
  const [datos, setDatos] = useState<Historial>({
    documentos: [], versiones: [], reimpresiones: [], auditoria: [], asientos: []
  })
  const [texto, setTexto] = useState('')
  const [aplicado, setAplicado] = useState('')
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState<Fila | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await window.api.invoke<Historial>('compras.ingreso.historial', {
        tipo: 'FACTURA_COMPRA', texto: aplicado, limite: 1000
      })
      setDatos({
        documentos: res.documentos ?? [],
        versiones: res.versiones ?? [],
        reimpresiones: res.reimpresiones ?? [],
        auditoria: res.auditoria ?? [],
        asientos: res.asientos ?? []
      })
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [aplicado])

  useEffect(() => { void cargar() }, [cargar])

  const columnas: Column<Fila>[] = [
    { key: 'numero', header: 'Ingreso #', render: (f) => <span className="font-medium">{txt(f.numero)}</span> },
    { key: 'proveedorNombre', header: 'Proveedor', value: (f) => txt(f.proveedorNombre) },
    { key: 'numeroProveedor', header: 'Factura/NCF', value: (f) => txt(f.numeroProveedor) || '—' },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    {
      key: 'estado', header: 'Estado',
      render: (f) => <Badge tone={tonos[txt(f.estado)] ?? 'neutral'}>{txt(f.estado)}</Badge>
    },
    { key: 'totalCent', header: 'Total', value: (f) => num(f.totalCent), render: (f) => money(num(f.totalCent)) }
  ]

  const id = seleccionado ? num(seleccionado.id) : 0
  const versiones = datos.versiones.filter((v) => num(v.docId) === id)
  const impresiones = datos.reimpresiones.filter((r) => num(r.docId) === id)
  const auditoria = datos.auditoria.filter((a) => num(a.entidadId) === id && txt(a.entidad) === 'documentos_compra')
  const asiento = seleccionado?.asientoId
    ? datos.asientos.find((a) => num(a.id) === num(seleccionado.asientoId))
    : undefined

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Buscar por número, factura/NCF o proveedor
            </label>
            <input
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setAplicado(texto) }}
              placeholder="Ej. B0100000001"
              aria-label="Buscar historial"
            />
          </div>
          <Button variant="secondary" onClick={() => setAplicado(texto)}><History size={14} /> Buscar</Button>
          <Button variant="ghost" onClick={() => { setTexto(''); setAplicado('') }}>Limpiar</Button>
          <Button variant="ghost" title="Actualizar" onClick={() => void cargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
        </div>
        <DataTable
          columns={columnas}
          data={datos.documentos}
          rowKey={(f) => num(f.id)}
          emptyText={cargando ? 'Cargando…' : 'No hay ingresos con estos criterios.'}
          actions={(fila) => (
            <button
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setSeleccionado(fila)}
              title="Ver historial"
              aria-label="Ver historial"
            >
              <Eye size={15} />
            </button>
          )}
        />
      </Card>

      <Modal
        open={!!seleccionado}
        title={`Historial de ${txt(seleccionado?.numero ?? '')}`}
        onClose={() => setSeleccionado(null)}
        width="max-w-4xl"
        footer={<Button variant="secondary" onClick={() => setSeleccionado(null)}>Cerrar</Button>}
      >
        <Seccion titulo="Versiones" vacio="Sin versiones registradas.">
          {versiones.map((version) => (
            <p key={num(version.id)} className="border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
              <strong>{txt(version.operacion)}</strong> · {txt(version.creadoEn)} · {txt(version.usuarioNombre) || `Usuario ${num(version.usuarioId)}`}
              {txt(version.motivo) && ` · ${txt(version.motivo)}`}
            </p>
          ))}
        </Seccion>
        <Seccion titulo="Auditoría" vacio="Sin eventos de auditoría.">
          {auditoria.map((evento) => (
            <p key={num(evento.id)} className="border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
              <strong>{txt(evento.accion)}</strong> · {txt(evento.creadoEn)} · {txt(evento.usuarioNombre) || `Usuario ${num(evento.usuarioId)}`}
            </p>
          ))}
        </Seccion>
        <Seccion titulo="Impresiones" vacio="Sin reimpresiones registradas.">
          {impresiones.map((impresion) => (
            <p key={num(impresion.id)} className="border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
              {txt(impresion.formato)} · {txt(impresion.creadoEn)} · {txt(impresion.motivo) || 'Sin motivo'}
            </p>
          ))}
        </Seccion>
        <Seccion titulo="Asiento contable" vacio="Este ingreso no tiene asiento asociado.">
          {asiento && (
            <p className="text-xs">
              <strong>{txt(asiento.numero)}</strong> · {txt(asiento.estado)} · {money(num(asiento.totalCent))}
            </p>
          )}
        </Seccion>
      </Modal>
    </>
  )
}

function Seccion({
  titulo, vacio, children
}: {
  titulo: string
  vacio: string
  children: React.ReactNode
}): React.JSX.Element {
  const hay = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <div className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
        {hay ? children : <p className="py-1 text-xs text-slate-400">{vacio}</p>}
      </div>
    </section>
  )
}

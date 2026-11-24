import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Truck } from 'lucide-react'
import { errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { number } from '@/lib/format'
import { num, txt, type Fila } from './types'

interface DetalleConduce { cabecera: Fila; lineas: Fila[] }

export function ConducesTab(): React.JSX.Element {
  const [conduces, setConduces] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<DetalleConduce | null>(null)
  const [entregas, setEntregas] = useState<Record<number, string>>({})

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setConduces(await window.api.invoke<Fila[]>('ventas.conduces') ?? [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function abrir(id: number): Promise<void> {
    try {
      const det = await window.api.invoke<DetalleConduce>('ventas.conduce.detalle', id)
      const cantidades: Record<number, string> = {}
      for (const linea of det.lineas) {
        const pendienteDocumento = Math.max(0, num(linea.cantidadDocumento) - num(linea.cantidadEntregada))
        // El backend limita cada entrega al pendiente de la línea del conduce.
        cantidades[num(linea.id)] = String(Math.min(num(linea.cantidad), pendienteDocumento))
      }
      setEntregas(cantidades)
      setDetalle(det)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function registrarEntrega(): Promise<void> {
    if (!detalle) return
    const lineas = detalle.lineas
      .map((linea) => ({ conduceLineaId: num(linea.id), cantidad: Number(entregas[num(linea.id)] ?? 0) }))
      .filter((linea) => linea.cantidad > 0)
    if (!lineas.length) { toast.warning('Indique una cantidad entregada.'); return }
    try {
      const res = await window.api.invoke<{ completo: boolean }>('ventas.conduce.entregar', {
        conduceId: num(detalle.cabecera.id), lineas
      })
      toast.success(res.completo ? 'Conduce completado.' : 'Entrega parcial registrada.')
      setDetalle(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnas: Column<Fila>[] = [
    { key: 'numero', header: 'Conduce', value: (f) => txt(f.numero) },
    { key: 'documentoNumero', header: 'Documento', value: (f) => txt(f.documentoNumero) },
    { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    {
      key: 'estado', header: 'Estado',
      render: (f) => <Badge tone={txt(f.estado) === 'COMPLETO' ? 'success' : txt(f.estado) === 'ANULADO' ? 'danger' : 'warning'}>{txt(f.estado)}</Badge>
    }
  ]

  return (
    <>
      <Card
        title="Conduces emitidos"
        subtitle="Entregas parciales vinculadas a documentos de venta."
        actions={<Button variant="secondary" size="sm" onClick={() => void cargar()}><RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /></Button>}
      >
        <DataTable
          columns={columnas}
          data={conduces}
          rowKey={(f) => num(f.id)}
          searchPlaceholder="Buscar conduce…"
          emptyText={cargando ? 'Cargando…' : 'No hay conduces registrados.'}
          actions={(fila) => (
            <button
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => void abrir(num(fila.id))}
              title="Registrar entrega"
              aria-label="Registrar entrega"
            >
              <Truck size={15} />
            </button>
          )}
        />
      </Card>

      <Modal
        open={!!detalle}
        title={`Entrega del conduce ${detalle?.cabecera.numero ?? ''}`}
        onClose={() => setDetalle(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetalle(null)}>Cancelar</Button>
            <Button onClick={() => void registrarEntrega()}>Registrar entrega</Button>
          </>
        }
      >
        <div className="space-y-2">
          {detalle?.lineas.map((linea) => (
            <div key={num(linea.id)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{txt(linea.descripcion)}</p>
                <p className="text-xs text-slate-500">
                  Documento: {number(linea.cantidadDocumento)} · Entregado: {number(linea.cantidadEntregada)}
                </p>
              </div>
              <TextInput
                type="number" min="0" step="0.01" className="w-28"
                value={entregas[num(linea.id)] ?? ''}
                onChange={(e) => setEntregas({ ...entregas, [num(linea.id)]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}

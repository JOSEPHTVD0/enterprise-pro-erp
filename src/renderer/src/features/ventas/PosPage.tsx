import { useCallback, useEffect, useState } from 'react'
import { FileDown, LockKeyhole, Printer, RefreshCw, RotateCcw, Save, Wallet } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { formatoGuardado } from '@/lib/formato-impresion'
import { AreaImpresion } from './AreaImpresion'
import { DocumentoForm } from './DocumentoForm'
import { nuevaLinea, payloadCabecera, primeraLineaIncompleta, totalesCarrito } from './carrito'
import { clave, formularioVacio, num, txt, type DatosImpresion, type Fila, type FormularioVenta, type LineaCarrito } from './types'
import { useVentasCatalogos } from './useVentasCatalogos'

interface SesionPOS { sesion: Fila | null; caja: Fila | undefined; movimientos: Fila[]; teoricoCent: number }

export function PosPage(): React.JSX.Element {
  const catalogos = useVentasCatalogos('pos.catalogos')
  const [sesion, setSesion] = useState<SesionPOS>({ sesion: null, caja: undefined, movimientos: [], teoricoCent: 0 })
  const [suspendidas, setSuspendidas] = useState<Fila[]>([])
  const [form, setForm] = useState(formularioVacio(catalogos))
  const [abrirOpen, setAbrirOpen] = useState(false)
  const [cerrarOpen, setCerrarOpen] = useState(false)
  const [montoApertura, setMontoApertura] = useState('0.00')
  const [montoCierre, setMontoCierre] = useState('0.00')
  const [obsCaja, setObsCaja] = useState('')
  const [nombreSuspension, setNombreSuspension] = useState('')
  const [suspenderOpen, setSuspenderOpen] = useState(false)
  const [ultima, setUltima] = useState<{ id: number; numero: string } | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresion | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargarSesion = useCallback(async () => {
    try {
      setSesion(await window.api.invoke<SesionPOS>('pos.sesion'))
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }, [])

  const cargarSuspendidas = useCallback(async () => {
    try {
      setSuspendidas(await window.api.invoke<Fila[]>('pos.suspendidas') ?? [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }, [])

  useEffect(() => { void cargarSesion() }, [cargarSesion])
  useEffect(() => { void cargarSuspendidas() }, [cargarSuspendidas])
  useEffect(() => {
    if (!form.almacenId && catalogos.almacenes.length) {
      setForm((f) => ({ ...f, almacenId: String(catalogos.almacenes[0].id) }))
    }
  }, [catalogos.almacenes, form.almacenId])

  const teoricoCent = num(sesion.teoricoCent)
  const totalCent = totalesCarrito(catalogos, form.lineas).totalCent

  function resetCarrito(): void {
    const base = formularioVacio(catalogos)
    base.lineas = [nuevaLinea(catalogos)]
    setForm(base)
  }

  async function abrirCaja(): Promise<void> {
    try {
      await window.api.invoke('pos.caja.abrir', {
        montoCent: Math.round((Number(montoApertura) || 0) * 100), observaciones: obsCaja
      })
      toast.success('Caja abierta correctamente.')
      setAbrirOpen(false)
      setObsCaja('')
      await cargarSesion()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function cerrarCaja(): Promise<void> {
    if (!sesion.sesion) return
    try {
      const res = await window.api.invoke<{ teoricoCent: number; diferenciaCent: number }>('pos.caja.cerrar', {
        sesionId: num(sesion.sesion.id),
        montoCent: Math.round((Number(montoCierre) || 0) * 100),
        observaciones: obsCaja
      })
      toast.success(`Caja cerrada. Teórico ${money(res.teoricoCent)} · Diferencia ${money(res.diferenciaCent)}.`)
      setCerrarOpen(false)
      setObsCaja('')
      await cargarSesion()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function vender(): Promise<void> {
    if (!sesion.sesion) { toast.warning('Abra la caja antes de vender.'); return }
    if (!form.clienteId) { toast.warning('Seleccione el cliente.'); return }
    if (!form.lineas.length) { toast.warning('Agregue productos al carrito.'); return }
    if (primeraLineaIncompleta(form.lineas)) { toast.warning('Complete o elimine las líneas vacías.'); return }
    setGuardando(true)
    try {
      const res = await window.api.invoke<{ id: number; numero: string }>('pos.vender', {
        ...payloadCabecera(form)
      })
      toast.success(`Venta ${res.numero} registrada.`)
      setUltima({ id: res.id, numero: res.numero })
      resetCarrito()
      await Promise.all([cargarSesion(), cargarSuspendidas()])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function suspender(): Promise<void> {
    if (!nombreSuspension.trim()) { toast.warning('Indique un nombre para la venta suspendida.'); return }
    if (primeraLineaIncompleta(form.lineas)) { toast.warning('Complete o elimine las líneas vacías.'); return }
    try {
      await window.api.invoke('pos.suspender', {
        nombre: nombreSuspension.trim(),
        carrito: { ...payloadCabecera(form) }
      })
      toast.success('Venta suspendida.')
      setSuspenderOpen(false)
      setNombreSuspension('')
      resetCarrito()
      await cargarSuspendidas()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function recuperar(id: number): Promise<void> {
    try {
      const res = await window.api.invoke<{ carrito: Record<string, unknown> }>('pos.recuperar', id)
      const carrito = res.carrito
      const lineas = Array.isArray(carrito.lineas) ? carrito.lineas as Record<string, unknown>[] : []
      const recuperadas: LineaCarrito[] = lineas.map((linea) => ({
        key: clave(),
        productoId: String(linea.productoId ?? ''),
        cantidad: String(linea.cantidad ?? 1),
        precioCent: ((Number(linea.precioCent) || 0) / 100).toFixed(2),
        descuentoPct: ((Number(linea.descuentoPctBp) || 0) / 100).toString(),
        impuestoId: linea.impuestoId ? String(linea.impuestoId) : '',
        exento: Boolean(linea.exento),
        numeroSerie: String(linea.numeroSerie ?? ''),
        lote: String(linea.lote ?? '')
      }))
      const siguiente: FormularioVenta = {
        ...formularioVacio(catalogos),
        clienteId: String(carrito.clienteId ?? ''),
        almacenId: carrito.almacenId ? String(carrito.almacenId) : form.almacenId,
        vendedorId: carrito.vendedorId ? String(carrito.vendedorId) : '',
        fecha: String(carrito.fecha ?? new Date().toISOString().slice(0, 10)),
        comentarios: String(carrito.comentarios ?? ''),
        lineas: recuperadas
      }
      setForm(siguiente)
      toast.success('Carrito recuperado.')
      await cargarSuspendidas()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function imprimirUltima(): Promise<void> {
    if (!ultima) return
    try {
      const formato = await formatoGuardado('POS', 'TICKET_80')
      setImpresion(await window.api.invoke<DatosImpresion>('ventas.imprimir.datos', { id: ultima.id, formato }))
      if (!await imprimirDocumento('POS', { formato })) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfTicket(): Promise<void> {
    if (!ultima) return
    try {
      const formato = await formatoGuardado('POS', 'TICKET_80')
      await guardarPdf({ origen: 'venta', id: num(ultima.id), formato })
      toast.success('PDF del ticket descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnasMov: Column<Fila>[] = [
    { key: 'descripcion', header: 'Descripción', value: (f) => txt(f.descripcion) },
    { key: 'tipo', header: 'Tipo', value: (f) => txt(f.tipo) },
    { key: 'metodo', header: 'Método', value: (f) => txt(f.metodo) },
    { key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent), render: (f) => <span className="tabular-nums">{money(num(f.montoCent))}</span> }
  ]

  const columnasSus: Column<Fila>[] = [
    { key: 'nombre', header: 'Nombre', value: (f) => txt(f.nombre) },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) }
  ]

  return (
    <>
      <PageHeader
        title="Punto de Venta"
        subtitle="Venta rápida con control de sesión; el cobro se registra en Cobros."
        actions={
          <>
            <Button variant="secondary" onClick={() => { void cargarSesion(); void cargarSuspendidas() }}>
              <RefreshCw size={14} />
            </Button>
            {can('pos.abrir_caja') && !sesion.sesion && <Button onClick={() => setAbrirOpen(true)}><Wallet size={14} /> Abrir caja</Button>}
            {can('pos.cerrar_caja') && sesion.sesion && (
              <Button variant="secondary" onClick={() => { setMontoCierre((teoricoCent / 100).toFixed(2)); setCerrarOpen(true) }}>
                <LockKeyhole size={14} /> Cerrar caja
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">
              {sesion.sesion ? `Caja ${txt(sesion.caja?.nombre)} · Sesión #${num(sesion.sesion.id)}` : 'Caja cerrada'}
            </p>
            <p className="text-xs text-slate-500">
              {sesion.sesion ? `Apertura ${money(num(sesion.sesion.montoAperturaCent))} · Teórico ${money(teoricoCent)}` : 'Abra una sesión para poder facturar desde el POS.'}
            </p>
          </div>
          {sesion.sesion ? <Badge tone="success">Abierta</Badge> : <Badge tone="danger">Cerrada</Badge>}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card title="Carrito de venta" subtitle="Busque el producto por código o selecciónelo en la lista.">
          <DocumentoForm
            catalogos={catalogos}
            form={form}
            onChange={setForm}
            permitirDescuento={can('pos.descuento')}
            permitirPrecio={can('pos.precio')}
          >
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              Esta venta generará un cargo cobrable. Para recibir el dinero, registre un recibo en el módulo <strong>Cobros</strong>.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {can('pos.crear') && (
                <Button variant="secondary" onClick={() => setSuspenderOpen(true)} disabled={!sesion.sesion}>
                  <Save size={14} /> Suspender
                </Button>
              )}
              {can('pos.crear') && (
                <Button onClick={() => void vender()} disabled={guardando || !sesion.sesion}>
                  {guardando ? 'Procesando…' : `Registrar venta ${money(totalCent)}`}
                </Button>
              )}
            </div>
            {ultima && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                <span>Última venta: <strong>{ultima.numero}</strong></span>
                {(can('pos.imprimir') || can('ventas.imprimir')) && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => void imprimirUltima()}><Printer size={14} /> Imprimir</Button>
                    <Button size="sm" variant="secondary" onClick={() => void guardarPdfTicket()}><FileDown size={14} /> PDF</Button>
                  </div>
                )}
              </div>
            )}
          </DocumentoForm>
        </Card>

        <div className="space-y-4">
          <Card title="Ventas suspendidas" subtitle={`${suspendidas.length} registro(s)`}>
            <DataTable
              columns={columnasSus}
              data={suspendidas}
              rowKey={(f) => num(f.id)}
              searchPlaceholder="Buscar…"
              pageSize={5}
              emptyText="No hay ventas suspendidas."
              actions={(fila) => (
                <button
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => void recuperar(num(fila.id))}
                  title="Recuperar venta"
                  aria-label="Recuperar venta"
                >
                  <RotateCcw size={15} />
                </button>
              )}
            />
          </Card>
          <Card title="Movimientos de caja" subtitle="Sesión abierta">
            <DataTable
              columns={columnasMov}
              data={sesion.movimientos}
              rowKey={(f) => num(f.id)}
              searchPlaceholder="Buscar movimiento…"
              pageSize={6}
              emptyText="Sin movimientos en esta sesión."
            />
          </Card>
        </div>
      </div>

      <Modal
        open={abrirOpen}
        title="Abrir caja"
        onClose={() => setAbrirOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setAbrirOpen(false)}>Cancelar</Button><Button onClick={() => void abrirCaja()}>Abrir caja</Button></>}
      >
        <div className="space-y-3">
          <Field label="Fondo inicial (RD$)">
            <TextInput type="number" min="0" step="0.01" value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)} />
          </Field>
          <Field label="Observaciones">
            <TextInput value={obsCaja} onChange={(e) => setObsCaja(e.target.value)} maxLength={300} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={cerrarOpen}
        title="Cerrar caja"
        onClose={() => setCerrarOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setCerrarOpen(false)}>Cancelar</Button><Button variant="danger" onClick={() => void cerrarCaja()}>Cerrar caja</Button></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Monto teórico: <strong>{money(teoricoCent)}</strong></p>
          <Field label="Monto contado (RD$)">
            <TextInput type="number" min="0" step="0.01" value={montoCierre} onChange={(e) => setMontoCierre(e.target.value)} />
          </Field>
          <Field label="Observaciones">
            <TextInput value={obsCaja} onChange={(e) => setObsCaja(e.target.value)} maxLength={300} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={suspenderOpen}
        title="Suspender venta"
        onClose={() => setSuspenderOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setSuspenderOpen(false)}>Cancelar</Button><Button onClick={() => void suspender()}>Suspender</Button></>}
      >
        <Field label="Nombre (mesa, cliente, referencia)">
          <TextInput value={nombreSuspension} onChange={(e) => setNombreSuspension(e.target.value)} maxLength={60} placeholder="Ej. Mesa 4" />
        </Field>
      </Modal>

      <AreaImpresion datos={impresion} />
    </>
  )
}

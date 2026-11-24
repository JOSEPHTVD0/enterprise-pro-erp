import { useCallback, useEffect, useState } from 'react'
import { Ban, Download, Eye, FileDown, FilePlus2, Filter, Printer, RefreshCw, Truck } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money, number } from '@/lib/format'
import { guardarPdf } from '@/lib/pdf'
import { descargarArchivo } from '@/features/inventario/descargar'
import { AreaImpresion } from './AreaImpresion'
import { DocumentoDetalle } from './DocumentoDetalle'
import { DocumentoForm } from './DocumentoForm'
import { PagosEditor } from './PagosEditor'
import { nuevaLinea, payloadCabecera, payloadPagos, totalesCarrito } from './carrito'
import { ConducesTab } from './ConducesTab'
import { clave, formularioVacio, num, txt, type DatosImpresion, type DetalleDocumento, type Fila } from './types'
import { useVentasCatalogos } from './useVentasCatalogos'

type TipoFactura = 'FACTURA_CONTADO' | 'FACTURA_CREDITO'
const estados: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVO: 'success', CONTABILIZADO: 'success', PENDIENTE: 'warning', APROBADA: 'info',
  CONVERTIDA: 'info', ANULADO: 'danger', VENCIDA: 'danger'
}

export function FacturacionPage(): React.JSX.Element {
  const catalogos = useVentasCatalogos('ventas.catalogos')
  const [tab, setTab] = useState('documentos')
  const [documentos, setDocumentos] = useState<Fila[]>([])
  const [filtro, setFiltro] = useState({ tipo: '', estado: '', cliente: '', desde: '', hasta: '' })
  const [aplicado, setAplicado] = useState(filtro)
  const [cargando, setCargando] = useState(true)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [tipoFactura, setTipoFactura] = useState<TipoFactura>('FACTURA_CONTADO')
  const [form, setForm] = useState(formularioVacio(catalogos))
  const [detalle, setDetalle] = useState<DetalleDocumento | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresion | null>(null)
  const [anular, setAnular] = useState<{ id: number; numero: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [conduce, setConduce] = useState<{ doc: Fila; lineas: Fila[]; cantidades: Record<number, string> } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!form.almacenId && catalogos.almacenes.length) {
      setForm((f) => ({ ...f, almacenId: String(catalogos.almacenes[0].id) }))
    }
  }, [catalogos.almacenes, form.almacenId])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const payload: Record<string, unknown> = {}
      if (aplicado.tipo) payload.tipo = aplicado.tipo
      if (aplicado.estado) payload.estado = aplicado.estado
      if (aplicado.cliente) payload.clienteId = Number(aplicado.cliente)
      if (aplicado.desde) payload.fechaDesde = aplicado.desde
      if (aplicado.hasta) payload.fechaHasta = aplicado.hasta
      const filas = await window.api.invoke<Fila[]>('ventas.documentos', payload)
      setDocumentos(filas ?? [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [aplicado])

  useEffect(() => { void cargar() }, [cargar])

  function abrirNuevo(): void {
    const base = formularioVacio(catalogos)
    base.lineas = [nuevaLinea(catalogos)]
    base.pagos = [{ key: clave(), metodo: 'EFECTIVO', monto: '', referencia: '' }]
    setForm(base)
    setTipoFactura('FACTURA_CONTADO')
    setNuevoOpen(true)
  }

  function cambiarTipo(tipo: TipoFactura): void {
    setTipoFactura(tipo)
    setForm((f) => ({
      ...f,
      pagos: tipo === 'FACTURA_CONTADO'
        ? (f.pagos.length ? f.pagos : [{ key: clave(), metodo: 'EFECTIVO', monto: '', referencia: '' }])
        : []
    }))
  }

  async function guardar(): Promise<void> {
    if (!form.clienteId) { toast.warning('Seleccione el cliente.'); return }
    if (!form.lineas.length) { toast.warning('Agregue al menos una línea.'); return }
    const totales = totalesCarrito(catalogos, form.lineas)
    if (totales.totalCent <= 0) { toast.warning('El total debe ser mayor que cero.'); return }
    if (tipoFactura === 'FACTURA_CONTADO') {
      const pagado = payloadPagos(form.pagos).reduce((s, p) => s + p.montoCent, 0)
      if (pagado !== totales.totalCent) {
        toast.warning(`Los pagos deben sumar ${money(totales.totalCent)}.`)
        return
      }
    }
    setGuardando(true)
    try {
      const resultado = await window.api.invoke<{ numero: string }>('ventas.factura.crear', {
        ...payloadCabecera(form),
        tipo: tipoFactura,
        pagos: tipoFactura === 'FACTURA_CONTADO' ? payloadPagos(form.pagos) : undefined
      })
      toast.success(`Factura ${resultado.numero} guardada correctamente.`)
      setNuevoOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function verDetalle(id: number): Promise<void> {
    try {
      setDetalle(await window.api.invoke<DetalleDocumento>('ventas.detalle', id))
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function imprimir(id: number, formato: 'CARTA' | 'MEDIA' | 'TICKET_80' | 'TICKET_58'): Promise<void> {
    try {
      setImpresion(await window.api.invoke<DatosImpresion>('ventas.imprimir.datos', { id, formato }))
      window.setTimeout(() => window.print(), 80)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfFactura(id: number): Promise<void> {
    try {
      await guardarPdf({ origen: 'venta', id, formato: 'CARTA' })
      toast.success('PDF generado y descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function confirmarAnulacion(): Promise<void> {
    if (!anular) return
    if (motivo.trim().length < 3) { toast.warning('Indique el motivo de la anulación.'); return }
    try {
      await window.api.invoke('ventas.anular', { id: anular.id, motivo: motivo.trim() })
      toast.success(`Documento ${anular.numero} anulado; se generó la reversa correspondiente.`)
      setAnular(null)
      setMotivo('')
      setDetalle(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function exportar(): Promise<void> {
    try {
      const payload: Record<string, unknown> = {}
      if (aplicado.tipo) payload.tipo = aplicado.tipo
      if (aplicado.estado) payload.estado = aplicado.estado
      if (aplicado.cliente) payload.clienteId = Number(aplicado.cliente)
      if (aplicado.desde) payload.fechaDesde = aplicado.desde
      if (aplicado.hasta) payload.fechaHasta = aplicado.hasta
      const res = await window.api.invoke<{ filename: string; base64: string }>('ventas.exportar', { filtro: payload })
      descargarArchivo(res.base64, res.filename)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function abrirConduce(doc: Fila): Promise<void> {
    try {
      const det = await window.api.invoke<DetalleDocumento>('ventas.detalle', num(doc.id))
      const cantidades: Record<number, string> = {}
      for (const linea of det.lineas) {
        const pendiente = num(linea.cantidad) - num(linea.cantidadEntregada)
        if (pendiente > 0) cantidades[num(linea.id)] = String(pendiente)
      }
      setConduce({ doc, lineas: det.lineas, cantidades })
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarConduce(): Promise<void> {
    if (!conduce) return
    const lineas = conduce.lineas
      .filter((linea) => num(linea.cantidad) - num(linea.cantidadEntregada) > 0)
      .map((linea) => ({ docLineaId: num(linea.id), cantidad: Number(conduce.cantidades[num(linea.id)] ?? 0) }))
      .filter((linea) => linea.cantidad > 0)
    if (!lineas.length) { toast.warning('Indique una cantidad a entregar.'); return }
    try {
      const res = await window.api.invoke<{ numero: string }>('ventas.conduce.crear', {
        docVentaId: num(conduce.doc.id), lineas
      })
      toast.success(`Conduce ${res.numero} creado.`)
      setConduce(null)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnas: Column<Fila>[] = [
    {
      key: 'numero', header: 'Número',
      render: (fila) => (
        <div className="flex items-center gap-2 font-medium">
          {txt(fila.numero)}
          {num(fila.esNcf) === 1 && <Badge tone="accent">NCF</Badge>}
        </div>
      )
    },
    { key: 'tipo', header: 'Tipo', value: (f) => txt(f.tipo) },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) },
    { key: 'clienteRnc', header: 'RNC/Cédula', value: (f) => txt(f.clienteRnc) || '—' },
    { key: 'condicion', header: 'Condición', value: (f) => txt(f.condicion) },
    {
      key: 'estado', header: 'Estado',
      render: (f) => <Badge tone={estados[txt(f.estado)] ?? 'neutral'}>{txt(f.estado)}</Badge>
    },
    { key: 'totalCent', header: 'Total', value: (f) => num(f.totalCent), render: (f) => <span className="tabular-nums">{money(num(f.totalCent))}</span> }
  ]

  const totalCent = totalesCarrito(catalogos, form.lineas).totalCent
  const puedeImprimir = (fila: Fila) => can('ventas.imprimir') || (txt(fila.tipo) === 'POS' && can('pos.imprimir'))

  return (
    <>
      <PageHeader
        title="Facturación"
        subtitle="Facturas de contado y crédito, conduces, anulaciones y trazabilidad fiscal."
        actions={
          <>
            <Button variant="secondary" onClick={() => void cargar()} title="Actualizar">
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            </Button>
            {can('ventas.exportar') && <Button variant="secondary" onClick={() => void exportar()}><Download size={14} /> Exportar</Button>}
            {can('ventas.crear') && <Button onClick={abrirNuevo}><FilePlus2 size={14} /> Nueva factura</Button>}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'documentos', label: 'Documentos' },
          { id: 'conduces', label: 'Conduces y entregas' }
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'documentos' && (
        <TabPanel>
          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Tipo">
                <select className={inputClass} value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="FACTURA_CONTADO">Factura contado</option>
                  <option value="FACTURA_CREDITO">Factura crédito</option>
                  <option value="POS">POS</option>
                  <option value="NOTA_CREDITO">Nota de crédito</option>
                  <option value="DEVOLUCION_VENTA">Devolución</option>
                </select>
              </Field>
              <Field label="Estado">
                <select className={inputClass} value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="ACTIVO">Activo</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="CONTABILIZADO">Contabilizado</option>
                  <option value="ANULADO">Anulado</option>
                </select>
              </Field>
              <Field label="Cliente ID">
                <TextInput type="number" min="1" value={filtro.cliente} onChange={(e) => setFiltro({ ...filtro, cliente: e.target.value })} />
              </Field>
              <Field label="Desde"><TextInput type="date" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} /></Field>
              <Field label="Hasta"><TextInput type="date" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} /></Field>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { const v = { tipo: '', estado: '', cliente: '', desde: '', hasta: '' }; setFiltro(v); setAplicado(v) }}>
                Limpiar
              </Button>
              <Button variant="secondary" onClick={() => setAplicado(filtro)}><Filter size={14} /> Aplicar filtros</Button>
            </div>
          </Card>

          <Card title="Documentos emitidos" subtitle={`${documentos.length} resultado(s)`}>
            <DataTable
              columns={columnas}
              data={documentos}
              rowKey={(f) => num(f.id)}
              searchPlaceholder="Buscar por número, cliente o RNC…"
              emptyText={cargando ? 'Cargando…' : 'No hay documentos con estos filtros.'}
              actions={(fila) => (
                <div className="flex justify-end gap-1">
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void verDetalle(num(fila.id))} title="Ver detalle" aria-label="Ver detalle">
                    <Eye size={15} />
                  </button>
                  {puedeImprimir(fila) && (
                    <>
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void imprimir(num(fila.id), 'CARTA')} title="Imprimir" aria-label="Imprimir">
                        <Printer size={15} />
                      </button>
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void guardarPdfFactura(num(fila.id))} title="Guardar PDF" aria-label="Guardar PDF">
                        <FileDown size={15} />
                      </button>
                    </>
                  )}
                  {can('ventas.crear') && ['ACTIVO', 'APROBADA', 'CONTABILIZADO'].includes(txt(fila.estado)) && (
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void abrirConduce(fila)} title="Crear conduce" aria-label="Crear conduce">
                      <Truck size={15} />
                    </button>
                  )}
                  {can('ventas.anular') && txt(fila.estado) !== 'ANULADO' && (
                    <button className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => { setAnular({ id: num(fila.id), numero: txt(fila.numero) }); setMotivo('') }} title="Anular" aria-label="Anular">
                      <Ban size={15} />
                    </button>
                  )}
                </div>
              )}
            />
          </Card>
        </TabPanel>
      )}

      {tab === 'conduces' && <TabPanel><ConducesTab /></TabPanel>}

      <Modal
        open={nuevoOpen}
        title="Nueva factura"
        onClose={() => setNuevoOpen(false)}
        width="max-w-6xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNuevoOpen(false)}>Cancelar</Button>
            <Button onClick={() => void guardar()} disabled={guardando || catalogos.cargando}>
              {guardando ? 'Guardando…' : 'Guardar factura'}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex gap-2">
          {(['FACTURA_CONTADO', 'FACTURA_CREDITO'] as TipoFactura[]).map((tipo) => (
            <button
              key={tipo}
              onClick={() => cambiarTipo(tipo)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tipoFactura === tipo ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}
            >
              {tipo === 'FACTURA_CONTADO' ? 'Contado' : 'Crédito'}
            </button>
          ))}
        </div>
        <DocumentoForm
          catalogos={catalogos}
          form={form}
          onChange={setForm}
          permitirDescuento={can('ventas.descuento')}
          permitirPrecio={can('ventas.precio')}
          mostrarVencimiento={tipoFactura === 'FACTURA_CREDITO'}
        >
          {tipoFactura === 'FACTURA_CONTADO' ? (
            <PagosEditor totalCent={totalCent} pagos={form.pagos} onChange={(pagos) => setForm({ ...form, pagos })} />
          ) : (
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              La factura a crédito genera un cargo real en CxC. No se registra ningún cobro automático; los abonos se gestionarán en el módulo de cuentas por cobrar.
            </p>
          )}
        </DocumentoForm>
      </Modal>

      <DocumentoDetalle
        detalle={detalle}
        onClose={() => setDetalle(null)}
        onPrint={detalle ? () => void imprimir(num(detalle.cabecera.id), 'CARTA') : undefined}
        puedeImprimir={detalle ? puedeImprimir(detalle.cabecera) : false}
      />

      <Modal
        open={!!anular}
        title={`Anular ${anular?.numero ?? ''}`}
        onClose={() => setAnular(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAnular(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void confirmarAnulacion()}>Anular documento</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          La anulación revierte el inventario, cancela el cargo CxC y genera una nota de crédito trazable.
        </p>
        <Field label="Motivo *">
          <TextInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique el motivo" maxLength={300} />
        </Field>
      </Modal>

      <Modal
        open={!!conduce}
        title={`Conduce de ${conduce?.doc.numero ?? ''}`}
        onClose={() => setConduce(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConduce(null)}>Cancelar</Button>
            <Button onClick={() => void guardarConduce()}>Crear conduce</Button>
          </>
        }
      >
        <div className="space-y-2">
          {conduce?.lineas.filter((linea) => num(linea.cantidad) - num(linea.cantidadEntregada) > 0).map((linea) => (
            <div key={num(linea.id)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{txt(linea.descripcion)}</p>
                <p className="text-xs text-slate-500">Pendiente: {number(num(linea.cantidad) - num(linea.cantidadEntregada))}</p>
              </div>
              <TextInput
                type="number" min="0" step="0.01" className="w-28"
                value={conduce.cantidades[num(linea.id)] ?? ''}
                onChange={(e) => setConduce({ ...conduce, cantidades: { ...conduce.cantidades, [num(linea.id)]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </Modal>

      <AreaImpresion datos={impresion} />
    </>
  )
}

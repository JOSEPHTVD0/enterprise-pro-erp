import { useCallback, useEffect, useState } from 'react'
import { Ban, CheckCheck, Eye, FileDown, FilePlus2, Printer, RefreshCw, Repeat2 } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { formatoGuardado } from '@/lib/formato-impresion'
import { descargarArchivo } from '@/features/inventario/descargar'
import { AreaImpresion } from './AreaImpresion'
import { DocumentoDetalle } from './DocumentoDetalle'
import { DocumentoForm } from './DocumentoForm'
import { nuevaLinea, payloadCabecera, primeraLineaIncompleta, totalesCarrito } from './carrito'
import { formularioVacio, num, txt, type DatosImpresion, type DetalleDocumento, type Fila } from './types'
import { useVentasCatalogos } from './useVentasCatalogos'

type TipoDestino = 'PEDIDO' | 'FACTURA_CONTADO' | 'FACTURA_CREDITO'
const estados: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'> = {
  PENDIENTE: 'warning', APROBADA: 'info', CONTABILIZADO: 'success',
  CONVERTIDA: 'accent', ANULADO: 'danger', VENCIDA: 'danger', ACTIVO: 'success'
}

export function CotizacionesPage(): React.JSX.Element {
  const catalogos = useVentasCatalogos('cotizaciones.catalogos')
  const [tipo, setTipo] = useState<'COTIZACION' | 'PEDIDO'>('COTIZACION')
  const [documentos, setDocumentos] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [form, setForm] = useState(formularioVacio(catalogos))
  const [detalle, setDetalle] = useState<DetalleDocumento | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresion | null>(null)
  const [anular, setAnular] = useState<{ id: number; numero: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [convertir, setConvertir] = useState<{ id: number; numero: string; tipo: string } | null>(null)
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>('PEDIDO')
  const [comentariosConversion, setComentariosConversion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const puedeFacturar = can('ventas.crear')
  const puedePedido = can('cotizaciones.crear')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setDocumentos(await window.api.invoke<Fila[]>('cotizaciones.documentos', { tipo }) ?? [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [tipo])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    if (!form.almacenId && catalogos.almacenes.length) {
      setForm((f) => ({ ...f, almacenId: String(catalogos.almacenes[0].id) }))
    }
  }, [catalogos.almacenes, form.almacenId])

  function abrirNuevo(): void {
    const base = formularioVacio(catalogos)
    base.lineas = [nuevaLinea(catalogos)]
    setForm(base)
    setNuevoOpen(true)
  }

  async function guardar(tipoGuardado: 'COTIZACION' | 'PEDIDO'): Promise<void> {
    if (!form.clienteId) { toast.warning('Seleccione el cliente.'); return }
    if (!form.lineas.length) { toast.warning('Agregue al menos una línea.'); return }
    if (primeraLineaIncompleta(form.lineas)) { toast.warning('Complete o elimine las líneas vacías.'); return }
    setGuardando(true)
    try {
      const canal = tipoGuardado === 'COTIZACION' ? 'cotizaciones.crear' : 'cotizaciones.pedido.crear'
      const res = await window.api.invoke<{ numero: string }>(canal, payloadCabecera(form))
      toast.success(`${tipoGuardado === 'COTIZACION' ? 'Cotización' : 'Pedido'} ${res.numero} guardado.`)
      setNuevoOpen(false)
      setTipo(tipoGuardado)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function verDetalle(id: number): Promise<void> {
    try { setDetalle(await window.api.invoke<DetalleDocumento>('ventas.detalle', id)) }
    catch (error) { toast.error(errorInfo(error).message) }
  }

  async function aprobar(id: number): Promise<void> {
    try {
      await window.api.invoke('ventas.aprobar', id)
      toast.success('Documento aprobado.')
      await cargar()
    } catch (error) { toast.error(errorInfo(error).message) }
  }

  async function confirmarAnulacion(): Promise<void> {
    if (!anular) return
    if (motivo.trim().length < 3) { toast.warning('Indique el motivo.'); return }
    try {
      await window.api.invoke('ventas.anular', { id: anular.id, motivo: motivo.trim() })
      toast.success('Documento anulado.')
      setAnular(null)
      setMotivo('')
      await cargar()
    } catch (error) { toast.error(errorInfo(error).message) }
  }

  async function confirmarConversion(): Promise<void> {
    if (!convertir) return
    if (tipoDestino === 'PEDIDO' && !puedePedido) { toast.warning('No tiene permiso para crear pedidos.'); return }
    if (tipoDestino !== 'PEDIDO' && !puedeFacturar) { toast.warning('No tiene permiso para crear facturas.'); return }
    try {
      const res = await window.api.invoke<{ numero: string }>('ventas.convertir', {
        id: convertir.id, tipoDestino, comentarios: comentariosConversion
      })
      toast.success(`Convertido al documento ${res.numero}.`)
      setConvertir(null)
      setComentariosConversion('')
      await cargar()
    } catch (error) { toast.error(errorInfo(error).message) }
  }

  async function imprimir(id: number): Promise<void> {
    try {
      const formato = await formatoGuardado(tipo)
      setImpresion(await window.api.invoke<DatosImpresion>('ventas.imprimir.datos', { id, formato }))
      if (!await imprimirDocumento('COTIZACION', { formato })) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) { toast.error(errorInfo(error).message) }
  }

  async function guardarPdfCotizacion(id: number): Promise<void> {
    try {
      const formato = await formatoGuardado(tipo)
      await guardarPdf({ origen: 'venta', id, formato })
      toast.success('PDF generado y descargado.')
    } catch (error) { toast.error(errorInfo(error).message) }
  }

  async function exportar(): Promise<void> {
    try {
      const res = await window.api.invoke<{ filename: string; base64: string }>('ventas.exportar', { filtro: { tipo } })
      descargarArchivo(res.base64, res.filename)
    } catch (error) { toast.error(errorInfo(error).message) }
  }

  const columnas: Column<Fila>[] = [
    { key: 'numero', header: 'Número', value: (f) => txt(f.numero) },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) },
    { key: 'vencimiento', header: 'Vencimiento', value: (f) => txt(f.vencimiento) || '—' },
    {
      key: 'estado', header: 'Estado',
      render: (f) => <Badge tone={estados[txt(f.estado)] ?? 'neutral'}>{txt(f.estado)}</Badge>
    },
    { key: 'totalCent', header: 'Total', value: (f) => num(f.totalCent), render: (f) => <span className="tabular-nums">{money(num(f.totalCent))}</span> }
  ]

  const totalCent = totalesCarrito(catalogos, form.lineas).totalCent

  return (
    <>
      <PageHeader
        title="Cotizaciones y Pedidos"
        subtitle="Documentos no contabilizados, convertibles a factura con trazabilidad."
        actions={
          <>
            <Button variant="secondary" onClick={() => void cargar()}><RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /></Button>
            {can('ventas.exportar') && <Button variant="secondary" onClick={() => void exportar()}>Exportar</Button>}
            {can('cotizaciones.crear') && <Button onClick={abrirNuevo}><FilePlus2 size={14} /> Nuevo documento</Button>}
          </>
        }
      />

      <div className="mb-4 flex gap-2">
        {(['COTIZACION', 'PEDIDO'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTipo(item)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${tipo === item ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}
          >
            {item === 'COTIZACION' ? 'Cotizaciones' : 'Pedidos'}
          </button>
        ))}
      </div>

      <Card title={tipo === 'COTIZACION' ? 'Cotizaciones' : 'Pedidos'} subtitle={`${documentos.length} registro(s)`}>
        <DataTable
          columns={columnas}
          data={documentos}
          rowKey={(f) => num(f.id)}
          searchPlaceholder="Buscar por número o cliente…"
          loading={cargando}
          emptyText='No hay documentos.'
          actions={(fila) => (
            <div className="flex justify-end gap-1">
              <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void verDetalle(num(fila.id))} title="Ver detalle" aria-label="Ver detalle"><Eye size={15} /></button>
              {can('cotizaciones.imprimir') && (
                <>
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void imprimir(num(fila.id))} title="Imprimir" aria-label="Imprimir"><Printer size={15} /></button>
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void guardarPdfCotizacion(num(fila.id))} title="Guardar PDF" aria-label="Guardar PDF"><FileDown size={15} /></button>
                </>
              )}
              {can('cotizaciones.aprobar') && ['PENDIENTE', 'ACTIVO'].includes(txt(fila.estado)) && (
                <button className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={() => void aprobar(num(fila.id))} title="Aprobar" aria-label="Aprobar"><CheckCheck size={15} /></button>
              )}
              {(puedeFacturar || (puedePedido && txt(fila.tipo) === 'COTIZACION')) && !['ANULADO', 'CONVERTIDA'].includes(txt(fila.estado)) && (
                <button
                  className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                  onClick={() => {
                    setConvertir({ id: num(fila.id), numero: txt(fila.numero), tipo: txt(fila.tipo) })
                    setTipoDestino(txt(fila.tipo) === 'COTIZACION' && puedePedido ? 'PEDIDO' : 'FACTURA_CONTADO')
                  }}
                  title="Convertir"
                  aria-label="Convertir"
                >
                  <Repeat2 size={15} />
                </button>
              )}
              {can('cotizaciones.anular') && txt(fila.estado) !== 'ANULADO' && (
                <button className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => { setAnular({ id: num(fila.id), numero: txt(fila.numero) }); setMotivo('') }} title="Anular" aria-label="Anular"><Ban size={15} /></button>
              )}
            </div>
          )}
        />
      </Card>

      <Modal
        open={nuevoOpen}
        title="Nueva cotización o pedido"
        onClose={() => setNuevoOpen(false)}
        width="max-w-6xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNuevoOpen(false)}>Cancelar</Button>
            {can('cotizaciones.crear') && <Button variant="secondary" onClick={() => void guardar('PEDIDO')} disabled={guardando}>Guardar pedido</Button>}
            {can('cotizaciones.crear') && <Button onClick={() => void guardar('COTIZACION')} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cotización'}</Button>}
          </>
        }
      >
        <DocumentoForm
          catalogos={catalogos}
          form={form}
          onChange={setForm}
          permitirDescuento={can('cotizaciones.descuento')}
          permitirPrecio={can('cotizaciones.precio')}
          mostrarVencimiento
        />
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
          Total estimado: <strong className="text-slate-700 dark:text-slate-200">{money(totalCent)}</strong>. Las cotizaciones y pedidos no afectan inventario ni generan CxC.
        </p>
      </Modal>

      <DocumentoDetalle detalle={detalle} onClose={() => setDetalle(null)} />

      <Modal
        open={!!anular}
        title={`Anular ${anular?.numero ?? ''}`}
        onClose={() => setAnular(null)}
        footer={<><Button variant="secondary" onClick={() => setAnular(null)}>Cancelar</Button><Button variant="danger" onClick={() => void confirmarAnulacion()}>Anular</Button></>}
      >
        <Field label="Motivo *"><TextInput value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></Field>
      </Modal>

      <Modal
        open={!!convertir}
        title={`Convertir ${convertir?.numero ?? ''}`}
        onClose={() => setConvertir(null)}
        footer={<><Button variant="secondary" onClick={() => setConvertir(null)}>Cancelar</Button><Button onClick={() => void confirmarConversion()}>Convertir</Button></>}
      >
        <div className="space-y-3">
          <Field label="Documento destino">
            <select className={inputClass} value={tipoDestino} onChange={(e) => setTipoDestino(e.target.value as TipoDestino)}>
              {puedePedido && convertir?.tipo === 'COTIZACION' && <option value="PEDIDO">Pedido</option>}
              {puedeFacturar && <option value="FACTURA_CONTADO">Factura de contado</option>}
              {puedeFacturar && <option value="FACTURA_CREDITO">Factura a crédito</option>}
            </select>
          </Field>
          <Field label="Comentarios">
            <TextInput value={comentariosConversion} onChange={(e) => setComentariosConversion(e.target.value)} maxLength={500} />
          </Field>
          <p className="text-xs text-slate-500">
            El documento de origen quedará marcado como convertido; el destino hereda cliente, líneas, impuestos y precios.
          </p>
        </div>
      </Modal>

      <AreaImpresion datos={impresion} />
    </>
  )
}

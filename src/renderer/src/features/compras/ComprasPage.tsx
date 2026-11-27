import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, CheckCheck, Download, Eye, FileDown, FilePlus2, Filter, Pencil, Printer, RefreshCw, PackageCheck, RotateCcw } from 'lucide-react'
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
import { money } from '@/lib/format'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { formatoGuardado } from '@/lib/formato-impresion'
import { descargarArchivo } from '@/features/inventario/descargar'
import { nuevaLinea, payloadCabecera, primeraLineaIncompleta, totalesCarrito } from './carrito'
import { CantidadesEditor, CompraForm, PagosEditor } from './ComprasForms'
import { AreaImpresionCompra, DetalleCompra as DetalleCompraModal } from './ComprasDetalle'
import { IngresoMercancia } from './IngresoMercancia'
import { HistorialIngresos } from './HistorialIngresos'
import { useComprasCatalogos } from './useComprasCatalogos'
import {
  clave, etiquetasTipo, formularioVacio, num, txt,
  type DatosImpresionCompra, type DetalleCompra, type Fila, type FormularioCompra
} from './types'

const tabTipos: Record<string, string> = {
  solicitudes: 'SOLICITUD_COMPRA',
  ordenes: 'ORDEN_COMPRA',
  recepciones: 'RECEPCION',
  facturas: 'FACTURA_COMPRA',
  devoluciones: 'DEVOLUCION_COMPRA'
}

const tonos: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDIENTE: 'warning', APROBADA: 'info', PARCIAL: 'warning', COMPLETO: 'success',
  CONTABILIZADO: 'success', CONVERTIDA: 'info', ANULADO: 'danger'
}

interface CantidadesState {
  doc: Fila
  lineas: Fila[]
  cantidades: Record<number, string>
  texto: string
}

export function ComprasPage(): React.JSX.Element {
  const catalogos = useComprasCatalogos()
  const [tab, setTab] = useState('solicitudes')
  const [documentos, setDocumentos] = useState<Fila[]>([])
  const [filtro, setFiltro] = useState({ estado: '', proveedor: '', desde: '', hasta: '' })
  const [aplicado, setAplicado] = useState(filtro)
  const [cargando, setCargando] = useState(true)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [form, setForm] = useState<FormularioCompra>(formularioVacio(catalogos, 'SOLICITUD_COMPRA'))
  const [detalle, setDetalle] = useState<DetalleCompra | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresionCompra | null>(null)
  const [anular, setAnular] = useState<{ id: number; numero: string } | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [recepcion, setRecepcion] = useState<CantidadesState | null>(null)
  const [devolucion, setDevolucion] = useState<CantidadesState | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState('ingreso')
  const [editarId, setEditarId] = useState<number | null>(null)

  useEffect(() => {
    if (!form.almacenId && catalogos.almacenes.length) {
      setForm((f) => ({ ...f, almacenId: String(catalogos.almacenes[0].id) }))
    }
  }, [catalogos.almacenes, form.almacenId])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const filas = await window.api.invoke<Fila[]>('compras.documentos', { limite: 1000 })
      setDocumentos(filas ?? [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const filtrados = useMemo(() => {
    const tipo = tabTipos[tab]
    return documentos.filter((fila) =>
      fila.tipo === tipo &&
      (!aplicado.estado || fila.estado === aplicado.estado) &&
      (!aplicado.proveedor || String(fila.proveedorId) === aplicado.proveedor) &&
      (!aplicado.desde || String(fila.fecha) >= aplicado.desde) &&
      (!aplicado.hasta || String(fila.fecha) <= aplicado.hasta)
    )
  }, [documentos, tab, aplicado])

  function abrirNuevo(tipo: FormularioCompra['tipo'], docOrigenId?: number): void {
    const base = formularioVacio(catalogos, tipo)
    base.lineas = [nuevaLinea(catalogos)]
    if (tipo === 'FACTURA_COMPRA' && docOrigenId) base.docOrigenId = String(docOrigenId)
    if (tipo === 'FACTURA_COMPRA') {
      base.pagos = [{ key: clave(), metodo: 'EFECTIVO', monto: '', referencia: '' }]
    }
    setForm(base)
    setNuevoOpen(true)
  }

  function origenFacturaValido(): boolean {
    const id = num(form.docOrigenId)
    if (!id) return true
    const origen = documentos.find((doc) => num(doc.id) === id)
    if (!origen) return false
    return ['ORDEN_COMPRA', 'RECEPCION'].includes(txt(origen.tipo)) && txt(origen.estado) !== 'ANULADO'
  }

  async function guardarNuevo(): Promise<void> {
    if (!form.proveedorId) { toast.warning('Seleccione el proveedor.'); return }
    if (!origenFacturaValido()) { toast.warning('El documento de origen ya no está disponible.'); return }
    if (!form.docOrigenId) {
      if (!form.lineas.length || primeraLineaIncompleta(form.lineas)) {
        toast.warning('Complete o elimine las líneas vacías.'); return
      }
      const totales = totalesCarrito(catalogos, form.lineas)
      if (totales.totalCent <= 0) { toast.warning('El total debe ser mayor que cero.'); return }
      if (form.tipo === 'FACTURA_COMPRA' && !form.credito) {
        const pagado = form.pagos.reduce((suma, pago) => suma + Math.round(num(pago.monto) * 100), 0)
        if (pagado !== totales.totalCent) {
          toast.warning(`Los pagos deben sumar ${money(totales.totalCent)}.`)
          return
        }
      }
    }

    setGuardando(true)
    try {
      let resultado: { numero: string } | undefined
      if (form.tipo === 'FACTURA_COMPRA' && form.docOrigenId) {
        resultado = await window.api.invoke<{ numero: string }>('compras.convertir', {
          id: num(form.docOrigenId), tipoDestino: 'FACTURA_COMPRA',
          almacenId: form.almacenId ? num(form.almacenId) : undefined,
          credito: form.credito,
          // En una conversión no se muestra el editor de pagos: si el usuario no
          // capturó montos, se omite el arreglo y el servicio aplica el pago por
          // defecto con el total calculado desde el documento de origen.
          pagos: form.credito || !form.pagos.some((pago) => num(pago.monto) > 0)
            ? undefined
            : form.pagos.map((pago) => ({
              metodo: pago.metodo, montoCent: Math.round(num(pago.monto) * 100), referencia: pago.referencia
            })),
          comentarios: form.comentarios
        })
      } else {
        const canal = form.tipo === 'SOLICITUD_COMPRA'
          ? 'compras.solicitud.crear'
          : form.tipo === 'ORDEN_COMPRA'
            ? 'compras.orden.crear'
            : 'compras.factura.crear'
        resultado = await window.api.invoke<{ numero: string }>(canal, payloadCabecera(form))
      }
      toast.success(`Documento ${resultado?.numero ?? ''} guardado correctamente.`)
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
      setDetalle(await window.api.invoke<DetalleCompra>('compras.detalle', id))
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  function editarIngreso(doc: Fila): void {
    if (!can('compras.modificar')) return
    setEditarId(num(doc.id))
    setVista('ingreso')
  }

  async function imprimir(id: number, tipoDoc?: string): Promise<void> {
    try {
      const formato = await formatoGuardado(tipoDoc ?? 'FACTURA_COMPRA')
      setImpresion(await window.api.invoke<DatosImpresionCompra>('compras.imprimir.datos', { id, formato }))
      if (!await imprimirDocumento('COMPRA', { formato })) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfCompra(id: number, tipoDoc?: string): Promise<void> {
    try {
      const formato = await formatoGuardado(tipoDoc ?? 'FACTURA_COMPRA')
      await guardarPdf({ origen: 'compra', id, formato })
      toast.success('PDF generado y descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function confirmarAnulacion(): Promise<void> {
    if (!anular) return
    if (motivoAnulacion.trim().length < 3) { toast.warning('Indique el motivo de la anulación.'); return }
    try {
      await window.api.invoke('compras.anular', { id: anular.id, motivo: motivoAnulacion.trim() })
      toast.success(`Documento ${anular.numero} anulado; se registró la reversa correspondiente.`)
      setAnular(null)
      setMotivoAnulacion('')
      setDetalle(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function abrirRecepcion(doc: Fila): Promise<void> {
    try {
      const det = await window.api.invoke<DetalleCompra>('compras.detalle', num(doc.id))
      const cantidades: Record<number, string> = {}
      for (const linea of det.lineas) {
        const pendiente = num(linea.cantidad) - num(linea.cantidadRecibida)
        if (pendiente > 0) cantidades[num(linea.id)] = String(pendiente)
      }
      setRecepcion({ doc, lineas: det.lineas, cantidades, texto: '' })
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarRecepcion(): Promise<void> {
    if (!recepcion) return
    const lineas = Object.entries(recepcion.cantidades)
      .map(([id, valor]) => ({ docLineaId: Number(id), cantidad: Number(valor) }))
      .filter((linea) => linea.cantidad > 0)
    if (!lineas.length) { toast.warning('Indique una cantidad a recibir.'); return }
    try {
      const res = await window.api.invoke<{ numero: string }>('compras.recepcion.crear', {
        ordenId: num(recepcion.doc.id), lineas, comentarios: recepcion.texto
      })
      toast.success(`Recepción ${res.numero} registrada; el inventario y el costo ya fueron actualizados.`)
      setRecepcion(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function abrirDevolucion(doc: Fila): Promise<void> {
    try {
      const det = await window.api.invoke<DetalleCompra>('compras.detalle', num(doc.id))
      const cantidades: Record<number, string> = {}
      for (const linea of det.lineas) {
        const disponible = num(linea.cantidadRecibida) - num(linea.cantidadDevuelta)
        if (disponible > 0) cantidades[num(linea.id)] = ''
      }
      setDevolucion({ doc, lineas: det.lineas, cantidades, texto: '' })
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarDevolucion(): Promise<void> {
    if (!devolucion) return
    if (devolucion.texto.trim().length < 3) { toast.warning('Indique el motivo de la devolución.'); return }
    const lineas = Object.entries(devolucion.cantidades)
      .map(([id, valor]) => {
        const linea = devolucion.lineas.find((l) => num(l.id) === Number(id))
        return {
          productoId: num(linea?.productoId),
          docLineaId: Number(id),
          cantidad: Number(valor)
        }
      })
      .filter((linea) => linea.productoId && linea.cantidad > 0)
    if (!lineas.length) { toast.warning('Indique una cantidad a devolver.'); return }
    try {
      const res = await window.api.invoke<{ numero: string }>('compras.devolucion.crear', {
        tipo: 'DEVOLUCION_COMPRA',
        proveedorId: num(devolucion.doc.proveedorId),
        docOrigenId: num(devolucion.doc.id),
        motivo: devolucion.texto.trim(),
        lineas
      })
      toast.success(`Devolución ${res.numero} registrada; el inventario fue revertido.`)
      setDevolucion(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function convertirSolicitud(doc: Fila): Promise<void> {
    try {
      await window.api.invoke('compras.convertir', { id: num(doc.id), tipoDestino: 'ORDEN_COMPRA' })
      toast.success(`Orden generada desde ${txt(doc.numero)}.`)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function aprobar(doc: Fila): Promise<void> {
    try {
      await window.api.invoke('compras.aprobar', num(doc.id))
      toast.success(`${txt(doc.numero)} aprobada.`)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function exportar(): Promise<void> {
    try {
      const filtroExport: Record<string, unknown> = { tipo: tabTipos[tab], limite: 1000 }
      if (aplicado.estado) filtroExport.estado = aplicado.estado
      if (aplicado.proveedor) filtroExport.proveedorId = num(aplicado.proveedor)
      if (aplicado.desde) filtroExport.fechaDesde = aplicado.desde
      if (aplicado.hasta) filtroExport.fechaHasta = aplicado.hasta
      const res = await window.api.invoke<{ filename: string; base64: string }>('compras.exportar', { filtro: filtroExport })
      descargarArchivo(res.base64, res.filename)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const origenPadre = (doc: Fila): Fila | undefined =>
    doc.docOrigenId ? documentos.find((d) => num(d.id) === num(doc.docOrigenId)) : undefined

  const columnas: Column<Fila>[] = [
    {
      key: 'numero', header: 'Número',
      render: (fila) => <span className="font-medium">{txt(fila.numero)}</span>
    },
    { key: 'proveedorNombre', header: 'Proveedor', value: (f) => txt(f.proveedorNombre) },
    { key: 'numeroProveedor', header: 'Factura/NCF', value: (f) => txt(f.numeroProveedor) || '—' },
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    { key: 'condicion', header: 'Condición', value: (f) => txt(f.condicion) },
    {
      key: 'estado', header: 'Estado',
      render: (f) => <Badge tone={tonos[txt(f.estado)] ?? 'neutral'}>{txt(f.estado)}</Badge>
    },
    {
      key: 'totalCent', header: 'Total',
      value: (f) => num(f.totalCent),
      render: (f) => <span className="tabular-nums">{money(num(f.totalCent))}</span>
    }
  ]

  const totalCent = totalesCarrito(catalogos, form.lineas).totalCent
  const origenOpciones = tab === 'facturas'
    ? documentos.filter((doc) => ['ORDEN_COMPRA', 'RECEPCION'].includes(txt(doc.tipo)) &&
        !['ANULADO', 'CONVERTIDA'].includes(txt(doc.estado)))
    : []

  return (
    <>
      <Tabs
        tabs={[
          { id: 'ingreso', label: 'Ingreso de mercancía' },
          { id: 'documentos', label: 'Documentos' },
          { id: 'historial', label: 'Historial' }
        ]}
        active={vista}
        onChange={(id) => { setVista(id); if (id !== 'ingreso') setEditarId(null) }}
      />
      {vista === 'ingreso' ? (
        <IngresoMercancia
          catalogos={catalogos}
          editarId={editarId}
          onEditarTerminado={() => setEditarId(null)}
          onGuardado={() => void cargar()}
        />
      ) : (
        <>
          {vista === 'historial' ? <HistorialIngresos /> : (
            <>
      <PageHeader
        title="Compras"
        subtitle="Solicitudes, órdenes, recepciones, facturas y devoluciones con CxP e inventario reales."
        actions={
          <>
            <Button variant="secondary" onClick={() => void cargar()} title="Actualizar">
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            </Button>
            {can('compras.exportar') && <Button variant="secondary" onClick={() => void exportar()}><Download size={14} /> Exportar</Button>}
            {can('compras.crear') && tab !== 'devoluciones' && tab !== 'recepciones' && (
              <Button onClick={() => abrirNuevo(tab === 'facturas' ? 'FACTURA_COMPRA' : tab === 'ordenes' ? 'ORDEN_COMPRA' : 'SOLICITUD_COMPRA')}>
                <FilePlus2 size={14} /> Nueva {etiquetasTipo[tabTipos[tab]]?.toLowerCase() ?? 'solicitud'}
              </Button>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'solicitudes', label: 'Solicitudes' },
          { id: 'ordenes', label: 'Órdenes' },
          { id: 'recepciones', label: 'Recepciones' },
          { id: 'facturas', label: 'Facturas' },
          { id: 'devoluciones', label: 'Devoluciones' }
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel>
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Estado">
              <select className={inputClass} value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="APROBADA">Aprobada</option>
                <option value="PARCIAL">Parcial</option>
                <option value="COMPLETO">Completo</option>
                <option value="CONTABILIZADO">Contabilizado</option>
                <option value="CONVERTIDA">Convertida</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </Field>
            <Field label="Proveedor">
              <select className={inputClass} value={filtro.proveedor} onChange={(e) => setFiltro({ ...filtro, proveedor: e.target.value })}>
                <option value="">Todos</option>
                {catalogos.proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>{proveedor.nombreComercial}</option>
                ))}
              </select>
            </Field>
            <Field label="Desde"><TextInput type="date" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} /></Field>
            <Field label="Hasta"><TextInput type="date" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Button variant="ghost" onClick={() => { const v = { estado: '', proveedor: '', desde: '', hasta: '' }; setFiltro(v); setAplicado(v) }}>
                Limpiar
              </Button>
              <Button variant="secondary" onClick={() => setAplicado(filtro)}><Filter size={14} /> Aplicar</Button>
            </div>
          </div>
        </Card>

        <Card title={`${etiquetasTipo[tabTipos[tab]] ?? ''}s`} subtitle={`${filtrados.length} resultado(s)`}>
          <DataTable
            columns={columnas}
            data={filtrados}
            rowKey={(f) => num(f.id)}
            searchPlaceholder="Buscar por número, proveedor o NCF…"
            emptyText={cargando ? 'Cargando…' : 'No hay documentos con estos filtros.'}
            actions={(fila) => (
              <div className="flex justify-end gap-1">
                <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => void verDetalle(num(fila.id))} title="Ver detalle" aria-label="Ver detalle">
                  <Eye size={15} />
                </button>
                {can('compras.imprimir') && (
                  <>
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => void imprimir(num(fila.id), txt(fila.tipo))} title="Imprimir" aria-label="Imprimir">
                      <Printer size={15} />
                    </button>
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => void guardarPdfCompra(num(fila.id), txt(fila.tipo))} title="Guardar PDF" aria-label="Guardar PDF">
                      <FileDown size={15} />
                    </button>
                  </>
                )}
                {tab === 'solicitudes' && can('compras.aprobar') && txt(fila.estado) === 'PENDIENTE' && (
                  <button className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    onClick={() => void aprobar(fila)} title="Aprobar" aria-label="Aprobar">
                    <CheckCheck size={15} />
                  </button>
                )}
                {tab === 'solicitudes' && can('compras.crear') && ['PENDIENTE', 'APROBADA'].includes(txt(fila.estado)) && (
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => void convertirSolicitud(fila)} title="Convertir a orden" aria-label="Convertir a orden">
                    <FilePlus2 size={15} />
                  </button>
                )}
                {tab === 'ordenes' && can('compras.crear') && !['ANULADO', 'CONVERTIDA', 'COMPLETO'].includes(txt(fila.estado)) && (
                  <>
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => void abrirRecepcion(fila)} title="Recibir mercancía" aria-label="Recibir mercancía">
                      <PackageCheck size={15} />
                    </button>
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => abrirNuevo('FACTURA_COMPRA', num(fila.id))} title="Facturar pendiente" aria-label="Facturar pendiente">
                      <FilePlus2 size={15} />
                    </button>
                  </>
                )}
                {tab === 'recepciones' && can('compras.crear') && !['ANULADO', 'CONVERTIDA'].includes(txt(fila.estado)) && (
                  <>
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => abrirNuevo('FACTURA_COMPRA', num(fila.id))} title="Facturar recepción" aria-label="Facturar recepción">
                      <FilePlus2 size={15} />
                    </button>
                    <button className="rounded p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      onClick={() => void abrirDevolucion(fila)} title="Devolver mercancía" aria-label="Devolver mercancía">
                      <RotateCcw size={15} />
                    </button>
                  </>
                )}
                {tab === 'facturas' && can('compras.crear') && txt(fila.estado) === 'CONTABILIZADO' &&
                  origenPadre(fila)?.tipo !== 'RECEPCION' && (
                    <button className="rounded p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      onClick={() => void abrirDevolucion(fila)} title="Devolver compra" aria-label="Devolver compra">
                      <RotateCcw size={15} />
                    </button>
                  )}
                {tab === 'facturas' && can('compras.modificar') &&
                  !['ANULADO', 'CONVERTIDA'].includes(txt(fila.estado)) && !fila.docOrigenId && (
                    <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => editarIngreso(fila)} title="Corregir ingreso" aria-label="Corregir ingreso">
                      <Pencil size={15} />
                    </button>
                  )}
                {can('compras.anular') && txt(fila.estado) !== 'ANULADO' && txt(fila.tipo) !== 'DEVOLUCION_COMPRA' && (
                  <button className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => { setAnular({ id: num(fila.id), numero: txt(fila.numero) }); setMotivoAnulacion('') }}
                    title="Anular" aria-label="Anular">
                    <Ban size={15} />
                  </button>
                )}
              </div>
            )}
          />
        </Card>
      </TabPanel>
            </>
          )}
        </>
      )}

      <Modal
        open={nuevoOpen}
        title={`Nueva ${etiquetasTipo[form.tipo]?.toLowerCase() ?? 'compra'}`}
        onClose={() => setNuevoOpen(false)}
        width="max-w-6xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNuevoOpen(false)}>Cancelar</Button>
            <Button onClick={() => void guardarNuevo()} disabled={guardando || catalogos.cargando}>
              {guardando ? 'Guardando…' : 'Guardar documento'}
            </Button>
          </>
        }
      >
        <CompraForm catalogos={catalogos} form={form} onChange={setForm} origenes={origenOpciones}>
          {form.tipo === 'FACTURA_COMPRA' && !form.docOrigenId && !form.credito && (
            <PagosEditor totalCent={totalCent} pagos={form.pagos}
              onChange={(pagos) => setForm({ ...form, pagos })} />
          )}
          {form.tipo === 'FACTURA_COMPRA' && !form.docOrigenId && form.credito && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              La factura a crédito genera un cargo real en CxP. No se registra ningún pago automático.
            </p>
          )}
        </CompraForm>
      </Modal>

      <Modal
        open={!!recepcion}
        title={`Recibir orden ${txt(recepcion?.doc.numero ?? '')}`}
        onClose={() => setRecepcion(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecepcion(null)}>Cancelar</Button>
            <Button onClick={() => void guardarRecepcion()}><PackageCheck size={14} /> Registrar recepción</Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          Cada cantidad se limita al pendiente de su línea. La recepción actualiza existencias, kardex y costo promedio.
        </p>
        {recepcion && (
          <CantidadesEditor
            lineas={recepcion.lineas}
            cantidades={recepcion.cantidades}
            onChange={(cantidades) => setRecepcion({ ...recepcion, cantidades })}
            disponible={(linea) => num(linea.cantidad) - num(linea.cantidadRecibida)}
          />
        )}
        <div className="mt-4">
          <Field label="Comentarios">
            <TextInput value={recepcion?.texto ?? ''} maxLength={500}
              onChange={(e) => setRecepcion(recepcion ? { ...recepcion, texto: e.target.value } : null)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!devolucion}
        title={`Devolver de ${txt(devolucion?.doc.numero ?? '')}`}
        onClose={() => setDevolucion(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDevolucion(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void guardarDevolucion()}><RotateCcw size={14} /> Registrar devolución</Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          Se generan movimientos inversos en el kardex. No se permite devolver dos veces la misma cantidad.
        </p>
        {devolucion && (
          <CantidadesEditor
            lineas={devolucion.lineas}
            cantidades={devolucion.cantidades}
            onChange={(cantidades) => setDevolucion({ ...devolucion, cantidades })}
            disponible={(linea) => num(linea.cantidadRecibida) - num(linea.cantidadDevuelta)}
          />
        )}
        <div className="mt-4">
          <Field label="Motivo *">
            <TextInput value={devolucion?.texto ?? ''} maxLength={300}
              onChange={(e) => setDevolucion(devolucion ? { ...devolucion, texto: e.target.value } : null)}
              placeholder="Explique el motivo de la devolución" />
          </Field>
        </div>
      </Modal>

      <DetalleCompraModal
        detalle={detalle}
        onClose={() => setDetalle(null)}
        onPrint={detalle ? () => void imprimir(num(detalle.cabecera.id), txt(detalle.cabecera.tipo)) : undefined}
        puedeImprimir={detalle ? can('compras.imprimir') : false}
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
          La anulación revierte el inventario movido por este documento, cancela la CxP y deja auditoría.
        </p>
        <Field label="Motivo *">
          <TextInput value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)}
            placeholder="Explique el motivo" maxLength={300} />
        </Field>
      </Modal>

      <AreaImpresionCompra datos={impresion} />
    </>
  )
}

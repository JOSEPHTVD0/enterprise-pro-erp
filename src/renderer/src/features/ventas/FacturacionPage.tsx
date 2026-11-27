import { useCallback, useEffect, useState } from 'react'
import { Ban, Download, Eye, FileDown, FilePlus2, Pencil, Printer, RefreshCw, Send, Trash2, Truck } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money, number } from '@/lib/format'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { formatoGuardado, type FormatoImpresion } from '@/lib/formato-impresion'
import { descargarArchivo } from '@/features/inventario/descargar'
import { AreaImpresion } from './AreaImpresion'
import { DocumentoDetalle } from './DocumentoDetalle'
import { DocumentoForm } from './DocumentoForm'
import { FacturacionEcfPanel } from './FacturacionEcfPanel'
import { nuevaLinea, payloadCabecera, primeraLineaIncompleta, totalesCarrito } from './carrito'
import { ConducesTab } from './ConducesTab'
import { FiltrosComerciales } from './FiltrosComerciales'
import {
  eliminarBorradorLocal, formularioDeBorrador, guardarBorradorLocal, listarBorradores,
  type BorradorFactura
} from './borradores'
import {
  filtroComercialVacio, payloadFiltroComercial, type FiltroComercial
} from './filtros-comerciales'
import { formularioVacio, num, txt, type DatosImpresion, type DetalleDocumento, type Fila } from './types'
import { useVentasCatalogos } from './useVentasCatalogos'

type TipoFactura = 'FACTURA_CONTADO' | 'FACTURA_CREDITO'
const estados: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVO: 'success', CONTABILIZADO: 'success', PENDIENTE: 'warning', APROBADA: 'info',
  CONVERTIDA: 'info', ANULADO: 'danger', VENCIDA: 'danger'
}

export function FacturacionPage(): React.JSX.Element {
  const catalogos = useVentasCatalogos('ventas.catalogos')
  const [tab, setTab] = useState('ecf')
  const [documentos, setDocumentos] = useState<Fila[]>([])
  const [filtro, setFiltro] = useState<FiltroComercial>(filtroComercialVacio)
  const [aplicado, setAplicado] = useState<FiltroComercial>(filtroComercialVacio)
  const [borradores, setBorradores] = useState<BorradorFactura[]>([])
  const [borradorActivo, setBorradorActivo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [tipoFactura, setTipoFactura] = useState<TipoFactura>('FACTURA_CONTADO')
  const [form, setForm] = useState(() => {
    const base = formularioVacio(catalogos)
    base.lineas = [nuevaLinea(catalogos)]
    return base
  })
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

  useEffect(() => { setBorradores(listarBorradores()) }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const payload = payloadFiltroComercial(aplicado)
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
    setForm(base)
    setTipoFactura('FACTURA_CONTADO')
    setBorradorActivo(null)
    setNuevoOpen(true)
  }

  function cambiarTipo(tipo: TipoFactura): void {
    setTipoFactura(tipo)
  }

  async function guardar(draftId?: string, origen?: typeof form, tipoOverride?: TipoFactura): Promise<void> {
    const destino = origen ?? form
    const tipoDestino = tipoOverride ?? tipoFactura
    if (!destino.clienteId) { toast.warning('Seleccione el cliente.'); return }
    if (!destino.lineas.length) { toast.warning('Agregue al menos una línea.'); return }
    if (primeraLineaIncompleta(destino.lineas)) { toast.warning('Complete o elimine las líneas vacías.'); return }
    const totales = totalesCarrito(catalogos, destino.lineas)
    if (totales.totalCent <= 0) { toast.warning('El total debe ser mayor que cero.'); return }
    setGuardando(true)
    try {
      const resultado = await window.api.invoke<{ numero: string }>('ventas.factura.crear', {
        ...payloadCabecera(destino),
        tipo: tipoDestino
      })
      if (draftId) {
        eliminarBorradorLocal(draftId)
        setBorradores(listarBorradores())
        setBorradorActivo(null)
        setTab('documentos')
      }
      toast.success(`Factura ${resultado.numero} guardada correctamente.`)
      setNuevoOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  function guardarBorrador(): void {
    if (!form.clienteId) { toast.warning('Seleccione el cliente antes de guardar el borrador.'); return }
    const guardado = guardarBorradorLocal(tipoFactura, form, borradorActivo ?? undefined)
    setBorradores(listarBorradores())
    setBorradorActivo(guardado.id)
    toast.success(`Borrador ${guardado.numero} guardado en este equipo; aún no está emitido.`)
  }

  function abrirBorrador(borrador: BorradorFactura): void {
    setForm(formularioDeBorrador(borrador, catalogos))
    setTipoFactura(borrador.tipo)
    setBorradorActivo(borrador.id)
    setTab('ecf')
    toast.info(`Editando ${borrador.numero}. Solo se emitirá cuando pulse Salvar F7.`)
  }

  function emitirBorrador(borrador: BorradorFactura): void {
    const destino = formularioDeBorrador(borrador, catalogos)
    setForm(destino)
    setTipoFactura(borrador.tipo)
    setBorradorActivo(borrador.id)
    void guardar(borrador.id, destino, borrador.tipo)
  }

  function borrarBorrador(borrador: BorradorFactura): void {
    eliminarBorradorLocal(borrador.id)
    setBorradores(listarBorradores())
    if (borradorActivo === borrador.id) setBorradorActivo(null)
    toast.success(`Borrador ${borrador.numero} eliminado.`)
  }

  async function verDetalle(id: number): Promise<void> {
    try {
      setDetalle(await window.api.invoke<DetalleDocumento>('ventas.detalle', id))
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function imprimir(id: number, tipoDoc?: string, fallback: FormatoImpresion = 'CARTA'): Promise<void> {
    try {
      const formato = await formatoGuardado(tipoDoc ?? 'FACTURA_CONTADO', fallback)
      setImpresion(await window.api.invoke<DatosImpresion>('ventas.imprimir.datos', { id, formato }))
      if (!await imprimirDocumento('FACTURA', { formato })) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfFactura(id: number, tipoDoc?: string): Promise<void> {
    try {
      const formato = await formatoGuardado(tipoDoc ?? 'FACTURA_CONTADO')
      await guardarPdf({ origen: 'venta', id, formato })
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
      const payload = payloadFiltroComercial(aplicado)
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

  const columnasBorradores: Column<BorradorFactura>[] = [
    { key: 'numero', header: 'Borrador', value: (b) => b.numero, render: (b) => <span className="font-medium">{b.numero}</span> },
    { key: 'tipo', header: 'Tipo', value: (b) => b.tipo },
    {
      key: 'cliente', header: 'Cliente',
      value: (b) => {
        const cliente = catalogos.clientes.find((c) => String(c.id) === b.form.clienteId)
        return txt(cliente?.nombre) || '—'
      }
    },
    {
      key: 'total', header: 'Total estimado',
      value: (b) => totalesCarrito(catalogos, b.form.lineas).totalCent,
      render: (b) => <span className="tabular-nums">{money(totalesCarrito(catalogos, b.form.lineas).totalCent)}</span>
    },
    { key: 'actualizadoEn', header: 'Actualizado', value: (b) => b.actualizadoEn.slice(0, 16).replace('T', ' ') }
  ]

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
          { id: 'ecf', label: 'Facturación ECF' },
          { id: 'documentos', label: 'Documentos' },
          { id: 'borradores', label: `Borradores (${borradores.length})` },
          { id: 'conduces', label: 'Conduces y entregas' }
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'ecf' && (
        <TabPanel>
          <FacturacionEcfPanel
            catalogos={catalogos}
            form={form}
            onChange={setForm}
            onGuardar={() => void guardar(borradorActivo ?? undefined)}
            onGuardarBorrador={guardarBorrador}
            onSalir={() => setTab('documentos')}
            guardando={guardando}
            cargando={catalogos.cargando}
            permitirPrecio={can('ventas.precio')}
            permitirDescuento={can('ventas.descuento')}
            tipoFactura={tipoFactura}
            onTipoFactura={cambiarTipo}
          />
        </TabPanel>
      )}

      {tab === 'documentos' && (
        <TabPanel>
          <FiltrosComerciales
            filtro={filtro}
            onChange={setFiltro}
            onAplicar={() => setAplicado(filtro)}
            onLimpiar={() => setAplicado(filtroComercialVacio())}
            clientes={catalogos.clientes}
            productos={catalogos.productos}
            estados={['ACTIVO', 'PENDIENTE', 'CONTABILIZADO', 'ANULADO']}
            titulo="Búsqueda filtrada de documentos"
          />

          <Card title="Documentos emitidos" subtitle={`${documentos.length} resultado(s)`}>
            <DataTable
              columns={columnas}
              data={documentos}
              rowKey={(f) => num(f.id)}
              storageKey="facturacion.documentos"
              searchPlaceholder="Buscar por número, cliente o RNC…"
              emptyText={cargando ? 'Cargando…' : 'No hay documentos con estos filtros.'}
              actions={(fila) => (
                <div className="flex justify-end gap-1">
                  <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void verDetalle(num(fila.id))} title="Ver detalle" aria-label="Ver detalle">
                    <Eye size={15} />
                  </button>
                  {puedeImprimir(fila) && (
                    <>
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void imprimir(num(fila.id), txt(fila.tipo))} title="Imprimir" aria-label="Imprimir">
                        <Printer size={15} />
                      </button>
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => void guardarPdfFactura(num(fila.id), txt(fila.tipo))} title="Guardar PDF" aria-label="Guardar PDF">
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

      {tab === 'borradores' && (
        <TabPanel>
          <Card
            title="Borradores locales"
            subtitle="No están emitidos: no reservan NCF, no generan CxC ni afectan inventario."
            actions={
              can('ventas.crear') && <Button size="sm" onClick={() => { const base = formularioVacio(catalogos); base.lineas = [nuevaLinea(catalogos)]; setForm(base); setBorradorActivo(null); setTab('ecf') }}>
                <FilePlus2 size={14} /> Nuevo borrador
              </Button>
            }
          >
            <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              Los borradores se guardan solo en este equipo. Edite libremente; al emitir se usa el mismo proceso auditado y el borrador se elimina.
            </p>
            <DataTable
              columns={columnasBorradores}
              data={borradores}
              rowKey={(b) => b.id}
              storageKey="facturacion.borradores"
              searchPlaceholder="Buscar borradores…"
              emptyText="No hay borradores guardados en este equipo."
              actions={(b) => (
                <div className="flex justify-end gap-1">
                  <button className="rounded p-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30" onClick={() => abrirBorrador(b)} title="Editar borrador" aria-label="Editar borrador">
                    <Pencil size={15} />
                  </button>
                  {can('ventas.crear') && (
                    <button className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={() => emitirBorrador(b)} title="Emitir borrador" aria-label="Emitir borrador">
                      <Send size={15} />
                    </button>
                  )}
                  <button className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => borrarBorrador(b)} title="Eliminar borrador" aria-label="Eliminar borrador">
                    <Trash2 size={15} />
                  </button>
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
          <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
            La factura genera un cargo cobrable real. Ventas no registra cobros: use el módulo <strong>Cobros</strong> para aplicar recibos y anticipos.
          </p>
        </DocumentoForm>
      </Modal>

      <DocumentoDetalle
        detalle={detalle}
        onClose={() => setDetalle(null)}
        onPrint={detalle ? () => void imprimir(num(detalle.cabecera.id), txt(detalle.cabecera.tipo)) : undefined}
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

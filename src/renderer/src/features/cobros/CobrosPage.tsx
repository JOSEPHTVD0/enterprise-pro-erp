import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileDown, FilePlus2, Printer, RefreshCw, Wallet } from 'lucide-react'
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
import { guardarPdf } from '@/lib/pdf'
import { descargarArchivo } from '@/features/inventario/descargar'
import { AreaImpresionFinanzas } from '../finanzas/AreaImpresionFinanzas'
import {
  Accion, AplicacionesEditor, BarraFiltros, DetalleFinanzasModal, ModalAnulacion,
  SelectorFormato, SelectorMetodo
} from '../finanzas/FinanzasShared'
import { useFinanzasCatalogos, useSesionesCaja } from '../finanzas/useFinanzasCatalogos'
import {
  anticipoVacio, centavos, cobroPagoVacio, esAnulado, filtroVacio, formatosDe, medioPagoValido,
  mensajeMedioPago, metodosDe, num, numOp, opciones, payloadFiltro, pendienteCent, pesos, textoOp,
  txt, type DatosImpresionFinanzas, type DetalleFinanzas, type Fila, type FormularioAnticipo,
  type FormularioCobroPago
} from '../finanzas/types'

type Tonos = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

function tonoEstado(estado: string): Tonos {
  const valor = estado.toUpperCase()
  if (['ANULADO', 'VENCIDO'].includes(valor)) return 'danger'
  if (['PAGADO', 'COMPLETO', 'APLICADO', 'COBRADO'].includes(valor)) return 'success'
  if (['PARCIAL', 'PENDIENTE'].includes(valor)) return 'warning'
  return 'info'
}

export function CobrosPage(): React.JSX.Element {
  const catalogos = useFinanzasCatalogos()
  const sesiones = useSesionesCaja()
  const [tab, setTab] = useState('facturas')
  const [facturas, setFacturas] = useState<Fila[]>([])
  const [recibos, setRecibos] = useState<Fila[]>([])
  const [anticipos, setAnticipos] = useState<Fila[]>([])
  const [filtro, setFiltro] = useState(filtroVacio)
  const [aplicado, setAplicado] = useState(filtroVacio)
  const [cargando, setCargando] = useState(true)
  const [formato, setFormato] = useState('CARTA')
  const [reciboOpen, setReciboOpen] = useState(false)
  const [formRecibo, setFormRecibo] = useState<FormularioCobroPago>(() => cobroPagoVacio([]))
  const [anticipoOpen, setAnticipoOpen] = useState(false)
  const [formAnticipo, setFormAnticipo] = useState<FormularioAnticipo>(() => anticipoVacio('CLIENTE', []))
  const [detalle, setDetalle] = useState<DetalleFinanzas | null>(null)
  const [detalleTitulo, setDetalleTitulo] = useState('Cobros')
  const [impresion, setImpresion] = useState<DatosImpresionFinanzas | null>(null)
  const [anular, setAnular] = useState<{ id: number; numero: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [productosVenta, setProductosVenta] = useState<Fila[]>([])

  useEffect(() => {
    if (!can('ventas.consultar')) return
    let activo = true
    void window.api.invoke<{ productos?: Fila[] }>('ventas.catalogos')
      .then((respuesta) => { if (activo) setProductosVenta(Array.isArray(respuesta?.productos) ? respuesta.productos : []) })
      .catch(() => { /* el filtro por producto queda disponible por ID */ })
    return () => { activo = false }
  }, [])

  const normalizarAnticipo = (fila: Fila): Fila => ({
    ...fila,
    clienteId: fila.clienteId ?? fila.entidadId,
    clienteNombre: fila.clienteNombre ?? fila.entidadNombre
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const filtros = payloadFiltro(aplicado)
      const [docs, recs, ants] = await Promise.all([
        window.api.invoke<Fila[]>('cobros.documentos', filtros),
        window.api.invoke<Fila[]>('cobros.recibos', filtros),
        window.api.invoke<Fila[]>('cobros.anticipos', filtros)
      ])
      setFacturas(Array.isArray(docs) ? docs : [])
      setRecibos(Array.isArray(recs) ? recs : [])
      setAnticipos(Array.isArray(ants) ? ants.map(normalizarAnticipo) : [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [aplicado])

  useEffect(() => { void cargar() }, [cargar])

  const coincide = (fila: Fila): boolean =>
    (!aplicado.estado || txt(fila.estado) === aplicado.estado) &&
    (!aplicado.desde || txt(fila.fecha) >= aplicado.desde) &&
    (!aplicado.hasta || txt(fila.fecha) <= aplicado.hasta) &&
    (!aplicado.entidadId || String(num(fila.clienteId)) === aplicado.entidadId)

  const visibles = useMemo(() => {
    const origen = tab === 'facturas' ? facturas : tab === 'recibos' ? recibos : anticipos
    return origen.filter(coincide)
  }, [facturas, recibos, anticipos, tab, aplicado])

  const pendientes = useMemo(() => facturas.filter((fila) =>
    pendienteCent(fila) > 0 && !esAnulado(fila) &&
    (!formRecibo.entidadId || String(num(fila.clienteId)) === formRecibo.entidadId)
  ), [facturas, formRecibo.entidadId])

  const anticiposDisponibles = useMemo(() => anticipos.filter((fila) =>
    !esAnulado(fila) && pendienteCent(fila) > 0 &&
    (!formRecibo.entidadId || String(num(fila.clienteId)) === formRecibo.entidadId)
  ), [anticipos, formRecibo.entidadId])

  const montoCent = centavos(formRecibo.monto)

  function abrirRecibo(clienteId?: string, documento?: Fila): void {
    const base = cobroPagoVacio(catalogos.clientes, clienteId ?? (filtro.entidadId ? String(num(filtro.entidadId)) : ''))
    if (documento) {
      const monto = pesos(pendienteCent(documento))
      base.monto = monto
      base.aplicaciones = [{ key: base.aplicaciones[0].key, documentoId: String(num(documento.id)), monto }]
    }
    setFormRecibo(base)
    setReciboOpen(true)
  }

  function abrirAnticipo(): void {
    setFormAnticipo(anticipoVacio('CLIENTE', catalogos.clientes))
    setAnticipoOpen(true)
  }

  async function guardarRecibo(): Promise<void> {
    if (!num(formRecibo.entidadId)) { toast.warning('Seleccione el cliente.'); return }
    if (montoCent <= 0) { toast.warning('El monto debe ser mayor que cero.'); return }
    const aplicaciones = formRecibo.aplicaciones
      .map((fila) => ({ cxcDocumentoId: num(fila.documentoId), montoCent: centavos(fila.monto) }))
      .filter((fila) => fila.cxcDocumentoId && fila.montoCent > 0)
    if (!aplicaciones.length) { toast.warning('Agregue al menos una aplicación válida.'); return }
    const totalAplicado = aplicaciones.reduce((suma, fila) => suma + fila.montoCent, 0)
    if (totalAplicado !== montoCent) {
      toast.warning(`Las aplicaciones deben sumar ${money(montoCent)}.`)
      return
    }
    if (!medioPagoValido(formRecibo)) { toast.warning(mensajeMedioPago); return }

    const payload: Record<string, unknown> = {
      clienteId: num(formRecibo.entidadId),
      montoCent,
      metodo: formRecibo.metodo,
      aplicaciones,
      comentarios: textoOp(formRecibo.comentarios),
      fecha: formRecibo.fecha,
      referencia: textoOp(formRecibo.referencia)
    }
    if (numOp(formRecibo.anticipoId)) payload.anticipoId = numOp(formRecibo.anticipoId)
    else if (formRecibo.metodo === 'EFECTIVO') payload.cajaSesionId = num(formRecibo.cajaSesionId)
    else payload.bancoCuentaId = num(formRecibo.bancoCuentaId)

    setGuardando(true)
    try {
      const res = await window.api.invoke<{ numero?: string }>('cobros.recibo.crear', payload)
      toast.success(`Recibo ${txt(res?.numero) || ''} registrado correctamente.`)
      setReciboOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarAnticipo(): Promise<void> {
    if (!num(formAnticipo.entidadId)) { toast.warning('Seleccione el cliente.'); return }
    const monto = centavos(formAnticipo.monto)
    if (monto <= 0) { toast.warning('El monto debe ser mayor que cero.'); return }
    if (!medioPagoValido(formAnticipo)) { toast.warning(mensajeMedioPago); return }
    const payload: Record<string, unknown> = {
      tipo: 'CLIENTE', entidadId: num(formAnticipo.entidadId), montoCent: monto,
      metodo: formAnticipo.metodo, fecha: formAnticipo.fecha,
      referencia: textoOp(formAnticipo.referencia)
    }
    if (formAnticipo.metodo === 'EFECTIVO') payload.cajaSesionId = num(formAnticipo.cajaSesionId)
    else payload.bancoCuentaId = num(formAnticipo.bancoCuentaId)

    setGuardando(true)
    try {
      await window.api.invoke('cobros.anticipo.crear', payload)
      toast.success('Anticipo registrado correctamente.')
      setAnticipoOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function verDetalle(id: number, titulo: string): Promise<void> {
    try {
      setDetalle(await window.api.invoke<DetalleFinanzas>('cobros.detalle', {
        id, tipo: tab === 'recibos' ? 'RECIBO' : 'DOCUMENTO'
      }))
      setDetalleTitulo(titulo)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function imprimir(id: number): Promise<void> {
    try {
      setImpresion(await window.api.invoke<DatosImpresionFinanzas>('cobros.imprimir', {
        id, formato, tipo: tab === 'recibos' ? 'RECIBO' : 'DOCUMENTO'
      }))
      window.setTimeout(() => window.print(), 80)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfCobros(id: number): Promise<void> {
    try {
      await guardarPdf({
        origen: 'cobros', id, formato, tipo: tab === 'recibos' ? 'RECIBO' : 'DOCUMENTO'
      })
      toast.success('PDF generado y descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function confirmarAnulacion(): Promise<void> {
    if (!anular) return
    if (motivo.trim().length < 3) { toast.warning('Indique el motivo de la anulación.'); return }
    try {
      await window.api.invoke('cobros.recibo.anular', { id: anular.id, motivo: motivo.trim() })
      toast.success(`Recibo ${anular.numero} anulado.`)
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
      const res = await window.api.invoke<{ filename: string; base64: string }>(
        'cobros.exportar', { filtro: payloadFiltro(aplicado) }
      )
      descargarArchivo(res.base64, res.filename)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnas: Column<Fila>[] = tab === 'facturas'
    ? [
      { key: 'numero', header: 'Número', value: (f) => txt(f.numeroDocumento) || txt(f.numero) || `#${num(f.id)}`, render: (f) => <span className="font-medium">{txt(f.numeroDocumento) || txt(f.numero) || `#${num(f.id)}`}</span> },
      { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) },
      { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
      { key: 'vencimiento', header: 'Vencimiento', value: (f) => txt(f.vencimiento) || '—' },
      { key: 'totalCent', header: 'Total', value: (f) => num(f.totalCent), render: (f) => <span className="tabular-nums">{money(num(f.totalCent))}</span> },
      { key: 'saldo', header: 'Pendiente', value: (f) => pendienteCent(f), render: (f) => <span className="tabular-nums">{money(pendienteCent(f))}</span> },
      { key: 'estado', header: 'Estado', value: (f) => txt(f.estado), render: (f) => <Badge tone={tonoEstado(txt(f.estado))}>{txt(f.estado) || '—'}</Badge> }
    ]
    : tab === 'recibos'
      ? [
        { key: 'numero', header: 'Recibo', value: (f) => txt(f.numero) || `#${num(f.id)}`, render: (f) => <span className="font-medium">{txt(f.numero) || `#${num(f.id)}`}</span> },
        { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) },
        { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
        { key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent), render: (f) => <span className="tabular-nums">{money(num(f.montoCent))}</span> },
        { key: 'metodo', header: 'Método', value: (f) => txt(f.metodo) },
        { key: 'referencia', header: 'Referencia', value: (f) => txt(f.referencia) || '—' },
        { key: 'estado', header: 'Estado', value: (f) => txt(f.estado), render: (f) => <Badge tone={tonoEstado(txt(f.estado))}>{txt(f.estado) || '—'}</Badge> }
      ]
      : [
        { key: 'numero', header: 'Anticipo', value: (f) => txt(f.numero) || `#${num(f.id)}`, render: (f) => <span className="font-medium">{txt(f.numero) || `#${num(f.id)}`}</span> },
        { key: 'clienteNombre', header: 'Cliente', value: (f) => txt(f.clienteNombre) },
        { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
        { key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent), render: (f) => <span className="tabular-nums">{money(num(f.montoCent))}</span> },
        { key: 'saldo', header: 'Disponible', value: (f) => pendienteCent(f), render: (f) => <span className="tabular-nums">{money(pendienteCent(f))}</span> },
        { key: 'estado', header: 'Estado', value: (f) => txt(f.estado), render: (f) => <Badge tone={tonoEstado(txt(f.estado))}>{txt(f.estado) || '—'}</Badge> }
      ]

  function acciones(fila: Fila): React.JSX.Element {
    const id = num(fila.id)
    return (
      <div className="flex justify-end gap-1">
        <Accion icono={<Eye size={15} />} etiqueta="Ver detalle" onClick={() => void verDetalle(id, 'Cobros')} />
        {can('cobros.imprimir') && tab !== 'anticipos' && (
          <>
            <Accion icono={<Printer size={15} />} etiqueta="Imprimir comprobante" onClick={() => void imprimir(id)} tono="info" />
            <Accion icono={<FileDown size={15} />} etiqueta="Guardar PDF" onClick={() => void guardarPdfCobros(id)} tono="info" />
          </>
        )}
        {can('cobros.crear') && tab === 'facturas' && pendienteCent(fila) > 0 && !esAnulado(fila) && (
          <Accion icono={<Wallet size={15} />} etiqueta="Registrar recibo" tono="success"
            onClick={() => abrirRecibo(String(num(fila.clienteId)), fila)} />
        )}
        {can('cobros.anular') && tab === 'recibos' && !esAnulado(fila) && (
          <Accion icono={<span className="text-sm font-bold">×</span>} etiqueta="Anular recibo" tono="danger"
            onClick={() => { setAnular({ id, numero: txt(fila.numero) || `#${id}` }); setMotivo('') }} />
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Cobros"
        subtitle="Cobre facturas y registre anticipos desde un área independiente de Ventas."
        actions={
          <>
            <Accion icono={<RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />} etiqueta="Actualizar listados" onClick={() => void cargar()} />
            {can('cobros.imprimir') && <SelectorFormato value={formato} onChange={setFormato} formatos={formatosDe(catalogos)} />}
            {can('cobros.exportar') && (
              <Button variant="secondary" onClick={() => void exportar()} title="Exporta la cartera CxC (facturas) a XLSX" aria-label="Exportar cartera CxC a XLSX">
                <Download size={14} /> Exportar cartera
              </Button>
            )}
            {can('cobros.crear') && (
              <>
                <Button variant="secondary" onClick={abrirAnticipo} title="Registrar anticipo de cliente" aria-label="Registrar anticipo de cliente">
                  Anticipo
                </Button>
                <Button onClick={() => abrirRecibo()} title="Registrar recibo de cliente" aria-label="Registrar recibo de cliente">
                  <FilePlus2 size={14} /> Nuevo recibo
                </Button>
              </>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'facturas', label: 'Facturas' },
          { id: 'recibos', label: 'Recibos' },
          { id: 'anticipos', label: 'Anticipos' }
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel>
        <BarraFiltros
          filtro={filtro}
          onChange={setFiltro}
          onAplicar={() => setAplicado(filtro)}
          onLimpiar={() => { const limpio = filtroVacio(); setFiltro(limpio); setAplicado(limpio) }}
          entidades={catalogos.clientes}
          entidadLabel="Cliente"
          estados={tab === 'facturas'
            ? ['PENDIENTE', 'PAGADO', 'ANULADO']
            : tab === 'recibos'
              ? ['CONTABILIZADO', 'ANULADO']
              : ['ACTIVO', 'APLICADO', 'ANULADO']}
        />

        <Card className="mb-4" title="Búsqueda avanzada" subtitle="Número, rango de monto y producto (aplica a facturas).">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Número / referencia">
              <TextInput value={filtro.numero} maxLength={60} placeholder="Ej. FAC-0001 o RIN-0002"
                onChange={(e) => setFiltro({ ...filtro, numero: e.target.value })} />
            </Field>
            <Field label="Monto mínimo">
              <TextInput type="number" min="0" step="0.01" value={filtro.montoMin}
                onChange={(e) => setFiltro({ ...filtro, montoMin: e.target.value })} />
            </Field>
            <Field label="Monto máximo">
              <TextInput type="number" min="0" step="0.01" value={filtro.montoMax}
                onChange={(e) => setFiltro({ ...filtro, montoMax: e.target.value })} />
            </Field>
            <Field label="Producto">
              {productosVenta.length ? (
                <select className={inputClass} value={filtro.productoId}
                  onChange={(e) => setFiltro({ ...filtro, productoId: e.target.value })} aria-label="Producto">
                  <option value="">Todos</option>
                  {productosVenta.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {txt(p.codigo) ? `${txt(p.codigo)} · ` : ''}{txt(p.descripcion) || String(p.id)}
                    </option>
                  ))}
                </select>
              ) : (
                <TextInput type="number" min="1" value={filtro.productoId} placeholder="ID de producto"
                  onChange={(e) => setFiltro({ ...filtro, productoId: e.target.value })} />
              )}
            </Field>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { const v = { ...filtro, numero: '', montoMin: '', montoMax: '', productoId: '' }; setFiltro(v); setAplicado(v) }}>Limpiar avanzado</Button>
            <Button variant="secondary" onClick={() => setAplicado(filtro)}>Aplicar filtros</Button>
          </div>
        </Card>

        <Card
          title={tab === 'facturas' ? 'Facturas por cobrar' : tab === 'recibos' ? 'Recibos' : 'Anticipos de clientes'}
          subtitle={`${visibles.length} resultado(s)`}
        >
          <DataTable
            columns={columnas}
            data={visibles}
            rowKey={(f) => num(f.id)}
            storageKey={`cobros.${tab}`}
            searchPlaceholder="Buscar por número, cliente o referencia…"
            emptyText={cargando ? 'Cargando…' : 'No hay registros con estos filtros.'}
            actions={acciones}
          />
        </Card>
      </TabPanel>

      <Modal
        open={reciboOpen}
        title="Nuevo recibo de cliente"
        onClose={() => setReciboOpen(false)}
        width="max-w-5xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReciboOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarRecibo()} disabled={guardando || catalogos.cargando}
              title="Registrar recibo" aria-label="Registrar recibo">
              {guardando ? 'Guardando…' : 'Registrar recibo'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cliente *">
            <select className={inputClass} value={formRecibo.entidadId}
              onChange={(e) => setFormRecibo({
                ...formRecibo, entidadId: e.target.value,
                aplicaciones: formRecibo.aplicaciones.map((fila) => ({ ...fila, documentoId: '', monto: '' }))
              })} aria-label="Cliente">
              {opciones(catalogos.clientes, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha"><TextInput type="date" value={formRecibo.fecha}
            onChange={(e) => setFormRecibo({ ...formRecibo, fecha: e.target.value })} /></Field>
          <Field label="Monto a cobrar RD$ *">
            <TextInput type="number" min="0" step="0.01" value={formRecibo.monto}
              onChange={(e) => setFormRecibo({ ...formRecibo, monto: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          <SelectorMetodo
            metodo={formRecibo.metodo}
            onMetodo={(metodo) => setFormRecibo({ ...formRecibo, metodo })}
            metodos={metodosDe(catalogos)}
            sesiones={sesiones}
            cajaSesionId={formRecibo.cajaSesionId}
            onCajaSesionId={(cajaSesionId) => setFormRecibo({ ...formRecibo, cajaSesionId })}
            cuentas={catalogos.bancosCuentas}
            bancoCuentaId={formRecibo.bancoCuentaId}
            onBancoCuentaId={(bancoCuentaId) => setFormRecibo({ ...formRecibo, bancoCuentaId })}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Anticipo a aplicar" hint="Opcional; reemplaza la cuenta de ingreso.">
            <select className={inputClass} value={formRecibo.anticipoId}
              onChange={(e) => setFormRecibo({ ...formRecibo, anticipoId: e.target.value })} aria-label="Anticipo a aplicar">
              {opciones(anticiposDisponibles, 'Sin anticipo').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Referencia">
            <TextInput value={formRecibo.referencia} maxLength={80}
              onChange={(e) => setFormRecibo({ ...formRecibo, referencia: e.target.value })}
              placeholder="Ej. transferencia, cheque" />
          </Field>
          <Field label="Comentarios">
            <TextInput value={formRecibo.comentarios} maxLength={300}
              onChange={(e) => setFormRecibo({ ...formRecibo, comentarios: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <AplicacionesEditor
            documentos={pendientes}
            aplicaciones={formRecibo.aplicaciones}
            onChange={(aplicaciones) => setFormRecibo({ ...formRecibo, aplicaciones })}
            montoCent={montoCent}
            documentoLabel="Factura pendiente"
          />
        </div>
      </Modal>

      <Modal
        open={anticipoOpen}
        title="Nuevo anticipo de cliente"
        onClose={() => setAnticipoOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAnticipoOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarAnticipo()} disabled={guardando} title="Registrar anticipo" aria-label="Registrar anticipo">Registrar anticipo</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente *">
            <select className={inputClass} value={formAnticipo.entidadId}
              onChange={(e) => setFormAnticipo({ ...formAnticipo, entidadId: e.target.value })} aria-label="Cliente">
              {opciones(catalogos.clientes, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Monto RD$ *">
            <TextInput type="number" min="0" step="0.01" value={formAnticipo.monto}
              onChange={(e) => setFormAnticipo({ ...formAnticipo, monto: e.target.value })} />
          </Field>
          <Field label="Fecha"><TextInput type="date" value={formAnticipo.fecha}
            onChange={(e) => setFormAnticipo({ ...formAnticipo, fecha: e.target.value })} /></Field>
          <Field label="Referencia"><TextInput value={formAnticipo.referencia} maxLength={80}
            onChange={(e) => setFormAnticipo({ ...formAnticipo, referencia: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          <SelectorMetodo
            metodo={formAnticipo.metodo}
            onMetodo={(metodo) => setFormAnticipo({ ...formAnticipo, metodo })}
            metodos={metodosDe(catalogos)}
            sesiones={sesiones}
            cajaSesionId={formAnticipo.cajaSesionId}
            onCajaSesionId={(cajaSesionId) => setFormAnticipo({ ...formAnticipo, cajaSesionId })}
            cuentas={catalogos.bancosCuentas}
            bancoCuentaId={formAnticipo.bancoCuentaId}
            onBancoCuentaId={(bancoCuentaId) => setFormAnticipo({ ...formAnticipo, bancoCuentaId })}
          />
        </div>
      </Modal>

      <DetalleFinanzasModal
        detalle={detalle}
        titulo={detalleTitulo}
        onClose={() => setDetalle(null)}
        onPrint={detalle ? () => void imprimir(num(detalle.cabecera.id)) : undefined}
        puedeImprimir={detalle ? can('cobros.imprimir') : false}
      />

      <ModalAnulacion
        abierto={!!anular}
        titulo={`Anular recibo ${anular?.numero ?? ''}`}
        descripcion="Se revertirán las aplicaciones del recibo y quedará constancia del motivo."
        motivo={motivo}
        onMotivo={setMotivo}
        onConfirmar={() => void confirmarAnulacion()}
        onClose={() => setAnular(null)}
      />

      <AreaImpresionFinanzas datos={impresion} />
    </>
  )
}


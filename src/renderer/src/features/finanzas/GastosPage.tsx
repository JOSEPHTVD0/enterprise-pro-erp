import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, FilePlus2, RefreshCw, RotateCw, Wallet } from 'lucide-react'
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
import {
  Accion, BarraFiltros, DetalleFinanzasModal, ModalAnulacion, SelectorMetodo
} from './FinanzasShared'
import { useFinanzasCatalogos, useSesionesCaja } from './useFinanzasCatalogos'
import {
  categoriaVacia, centavos, comisionVacia, esAnulado, filtroVacio, frecuenciasRecurrentes, gastoVacio,
  medioPagoValido, mensajeMedioPago, num, numOp, opciones, pagoVacio, payloadFiltro, recurrenteVacio,
  textoOp, txt, type DetalleFinanzas, type Fila, type FormularioCategoria, type FormularioComision,
  type FormularioGasto, type FormularioPago, type FormularioRecurrente
} from './types'

const metodosGasto = ['EFECTIVO', 'BANCO']

function tonoGasto(estado: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const valor = estado.toUpperCase()
  if (valor === 'ANULADO') return 'danger'
  if (['PAGADO', 'APLICADO'].includes(valor)) return 'success'
  if (['PENDIENTE', 'PARCIAL'].includes(valor)) return 'warning'
  return 'info'
}

export function GastosPage(): React.JSX.Element {
  const catalogos = useFinanzasCatalogos()
  const sesiones = useSesionesCaja()
  const [tab, setTab] = useState('gastos')
  const [gastos, setGastos] = useState<Fila[]>([])
  const [categorias, setCategorias] = useState<Fila[]>([])
  const [recurrentes, setRecurrentes] = useState<Fila[]>([])
  const [comisiones, setComisiones] = useState<Fila[]>([])
  const [filtro, setFiltro] = useState(filtroVacio)
  const [aplicado, setAplicado] = useState(filtroVacio)
  const [cargando, setCargando] = useState(true)
  const [gastoOpen, setGastoOpen] = useState(false)
  const [formGasto, setFormGasto] = useState<FormularioGasto>(() => gastoVacio([], []))
  const [categoriaOpen, setCategoriaOpen] = useState(false)
  const [formCategoria, setFormCategoria] = useState<FormularioCategoria>(categoriaVacia)
  const [recurrenteOpen, setRecurrenteOpen] = useState(false)
  const [formRecurrente, setFormRecurrente] = useState<FormularioRecurrente>(() => recurrenteVacio([], []))
  const [comisionOpen, setComisionOpen] = useState(false)
  const [formComision, setFormComision] = useState<FormularioComision>(() => comisionVacia([]))
  const [pago, setPago] = useState<{ tipo: 'gasto' | 'comision'; numero: string; form: FormularioPago } | null>(null)
  const [detalle, setDetalle] = useState<DetalleFinanzas | null>(null)
  const [anular, setAnular] = useState<{ id: number; numero: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const filtros = payloadFiltro(aplicado)
      const [gastosRes, categoriasRes, recurrentesRes, comisionesRes] = await Promise.all([
        window.api.invoke<Fila[]>('gastos.documentos', filtros),
        window.api.invoke<Fila[]>('gastos.categorias', filtros),
        window.api.invoke<Fila[]>('gastos.recurrentes', filtros),
        window.api.invoke<Fila[]>('comisiones.list', filtros)
      ])
      setGastos(Array.isArray(gastosRes) ? gastosRes : [])
      setCategorias(Array.isArray(categoriasRes) ? categoriasRes : [])
      setRecurrentes(Array.isArray(recurrentesRes) ? recurrentesRes : [])
      setComisiones(Array.isArray(comisionesRes) ? comisionesRes : [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [aplicado])

  useEffect(() => { void cargar() }, [cargar])

  const visibles = useMemo(() => {
    const origen = tab === 'gastos' ? gastos : tab === 'recurrentes' ? recurrentes : comisiones
    return origen.filter((fila) =>
      (!aplicado.desde || txt(fila.fecha) >= aplicado.desde) &&
      (!aplicado.hasta || txt(fila.fecha) <= aplicado.hasta) &&
      (!aplicado.estado || txt(fila.estado) === aplicado.estado) &&
      (!aplicado.entidadId ||
        String(num(fila.proveedorId)) === aplicado.entidadId ||
        String(num(fila.vendedorId)) === aplicado.entidadId)
    )
  }, [gastos, recurrentes, comisiones, tab, aplicado])

  function abrirPago(tipo: 'gasto' | 'comision', id: number, numero: string): void {
    setPago({ tipo, numero, form: pagoVacio(id) })
  }

  async function guardarGasto(): Promise<void> {
    if (!num(formGasto.categoriaId)) { toast.warning('Seleccione la categoría.'); return }
    if (!formGasto.concepto.trim()) { toast.warning('Indique el concepto del gasto.'); return }
    const montoCent = centavos(formGasto.monto)
    if (montoCent <= 0) { toast.warning('El monto debe ser mayor que cero.'); return }
    if (!medioPagoValido(formGasto)) { toast.warning(mensajeMedioPago); return }

    const payload: Record<string, unknown> = {
      categoriaId: num(formGasto.categoriaId),
      fecha: formGasto.fecha,
      concepto: formGasto.concepto.trim(),
      montoCent,
      impuestoCent: centavos(formGasto.impuesto),
      metodo: formGasto.metodo,
      docReferencia: textoOp(formGasto.docReferencia)
    }
    const proveedorId = numOp(formGasto.proveedorId)
    if (proveedorId) payload.proveedorId = proveedorId
    const recurrenteId = numOp(formGasto.recurrenteId)
    if (recurrenteId) payload.recurrenteId = recurrenteId
    if (formGasto.metodo === 'EFECTIVO') payload.cajaSesionId = num(formGasto.cajaSesionId)
    else payload.bancoCuentaId = num(formGasto.bancoCuentaId)

    setGuardando(true)
    try {
      await window.api.invoke('gastos.crear', payload)
      toast.success('Gasto registrado correctamente.')
      setGastoOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarPago(): Promise<void> {
    if (!pago) return
    if (!medioPagoValido(pago.form)) { toast.warning(mensajeMedioPago); return }
    const canal = pago.tipo === 'gasto' ? 'gastos.pagar' : 'comisiones.pagar'
    const payload: Record<string, unknown> = {
      id: pago.form.id,
      metodo: pago.form.metodo === 'EFECTIVO' ? 'EFECTIVO' : 'BANCO',
      referencia: textoOp(pago.form.referencia)
    }
    if (pago.form.metodo === 'EFECTIVO') payload.cajaSesionId = num(pago.form.cajaSesionId)
    else payload.bancoCuentaId = num(pago.form.bancoCuentaId)

    setGuardando(true)
    try {
      await window.api.invoke(canal, payload)
      toast.success(`${pago.tipo === 'gasto' ? 'Gasto' : 'Comisión'} ${pago.numero} pagado correctamente.`)
      setPago(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarCategoria(): Promise<void> {
    if (!formCategoria.codigo.trim() || !formCategoria.nombre.trim()) {
      toast.warning('Código y nombre son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      await window.api.invoke('gastos.categoria.crear', {
        codigo: formCategoria.codigo.trim(),
        nombre: formCategoria.nombre.trim(),
        activa: formCategoria.activa
      })
      toast.success('Categoría creada correctamente.')
      setCategoriaOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarRecurrente(): Promise<void> {
    if (!num(formRecurrente.categoriaId)) { toast.warning('Seleccione la categoría.'); return }
    if (!formRecurrente.concepto.trim()) { toast.warning('Indique el concepto.'); return }
    const montoCent = centavos(formRecurrente.monto)
    if (montoCent <= 0) { toast.warning('El monto debe ser mayor que cero.'); return }
    if (!formRecurrente.proximaFecha) { toast.warning('Indique la próxima fecha.'); return }
    const payload: Record<string, unknown> = {
      categoriaId: num(formRecurrente.categoriaId),
      concepto: formRecurrente.concepto.trim(),
      montoCent,
      impuestoCent: centavos(formRecurrente.impuesto),
      frecuencia: formRecurrente.frecuencia,
      proximaFecha: formRecurrente.proximaFecha,
      activa: formRecurrente.activa
    }
    const proveedorId = numOp(formRecurrente.proveedorId)
    if (proveedorId) payload.proveedorId = proveedorId

    setGuardando(true)
    try {
      await window.api.invoke('gastos.recurrente.crear', payload)
      toast.success('Gasto recurrente creado correctamente.')
      setRecurrenteOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function generarRecurrente(id: number): Promise<void> {
    try {
      await window.api.invoke('gastos.recurrente.generar', id)
      toast.success('Gasto generado desde la configuración recurrente.')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarComision(): Promise<void> {
    if (!num(formComision.vendedorId)) { toast.warning('Seleccione el vendedor.'); return }
    if (!num(formComision.docVentaId)) { toast.warning('Indique el ID de la venta.'); return }
    const baseCent = centavos(formComision.base)
    if (baseCent <= 0) { toast.warning('La base debe ser mayor que cero.'); return }
    const pctBp = num(formComision.pctBp)
    if (pctBp < 0) { toast.warning('El porcentaje no puede ser negativo.'); return }

    setGuardando(true)
    try {
      await window.api.invoke('comisiones.crear', {
        vendedorId: num(formComision.vendedorId),
        docVentaId: num(formComision.docVentaId),
        baseCent,
        pctBp,
        fecha: formComision.fecha
      })
      toast.success('Comisión registrada correctamente.')
      setComisionOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarAnulacion(): Promise<void> {
    if (!anular || motivo.trim().length < 3) return
    try {
      await window.api.invoke('gastos.anular', { id: anular.id, motivo: motivo.trim() })
      toast.success(`Gasto ${anular.numero} anulado.`)
      setAnular(null)
      setMotivo('')
      setDetalle(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function verDetalle(id: number): Promise<void> {
    try {
      setDetalle(await window.api.invoke<DetalleFinanzas>('gastos.detalle', id))
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnas: Column<Fila>[] = tab === 'gastos'
    ? [
      { key: 'numero', header: 'Gasto', value: (f) => txt(f.numero) || `#${num(f.id)}` },
      { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
      { key: 'categoriaNombre', header: 'Categoría', value: (f) => txt(f.categoriaNombre) || `#${num(f.categoriaId)}` },
      { key: 'proveedorNombre', header: 'Proveedor', value: (f) => txt(f.proveedorNombre) || '—' },
      { key: 'concepto', header: 'Concepto', value: (f) => txt(f.concepto) },
      { key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent), render: (f) => <span className="tabular-nums">{money(num(f.montoCent))}</span> },
      { key: 'estado', header: 'Estado', value: (f) => txt(f.estado), render: (f) => <Badge tone={tonoGasto(txt(f.estado))}>{txt(f.estado) || '—'}</Badge> }
    ]
    : tab === 'categorias'
      ? [
        { key: 'codigo', header: 'Código', value: (f) => txt(f.codigo) },
        { key: 'nombre', header: 'Nombre', value: (f) => txt(f.nombre), render: (f) => <span className="font-medium">{txt(f.nombre)}</span> },
        {
          key: 'activa', header: 'Estado',
          value: (f) => (f.activa === false || num(f.activa) === 0 ? 'Inactiva' : 'Activa'),
          render: (f) => <Badge tone={f.activa === false || num(f.activa) === 0 ? 'neutral' : 'success'}>
            {f.activa === false || num(f.activa) === 0 ? 'Inactiva' : 'Activa'}
          </Badge>
        }
      ]
      : tab === 'recurrentes'
        ? [
          { key: 'concepto', header: 'Concepto', value: (f) => txt(f.concepto), render: (f) => <span className="font-medium">{txt(f.concepto)}</span> },
          { key: 'categoriaNombre', header: 'Categoría', value: (f) => txt(f.categoriaNombre) || `#${num(f.categoriaId)}` },
          { key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent), render: (f) => <span className="tabular-nums">{money(num(f.montoCent))}</span> },
          { key: 'frecuencia', header: 'Frecuencia', value: (f) => txt(f.frecuencia) },
          { key: 'proximaFecha', header: 'Próxima fecha', value: (f) => txt(f.proximaFecha) || '—' },
          {
            key: 'activa', header: 'Estado', value: (f) => (f.activa === false || num(f.activa) === 0 ? 'Inactiva' : 'Activa'),
            render: (f) => <Badge tone={f.activa === false || num(f.activa) === 0 ? 'neutral' : 'success'}>
              {f.activa === false || num(f.activa) === 0 ? 'Inactiva' : 'Activa'}
            </Badge>
          }
        ]
        : [
          { key: 'vendedorNombre', header: 'Vendedor', value: (f) => txt(f.vendedorNombre) || `#${num(f.vendedorId)}` },
          { key: 'docVentaId', header: 'Venta', value: (f) => `#${num(f.docVentaId)}` },
          { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
          { key: 'baseCent', header: 'Base', value: (f) => num(f.baseCent), render: (f) => <span className="tabular-nums">{money(num(f.baseCent))}</span> },
          { key: 'pctBp', header: 'Comisión', value: (f) => `${num(f.pctBp) / 100}%` },
          { key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent), render: (f) => <span className="tabular-nums">{money(num(f.montoCent))}</span> },
          { key: 'estado', header: 'Estado', value: (f) => txt(f.estado), render: (f) => <Badge tone={tonoGasto(txt(f.estado))}>{txt(f.estado) || '—'}</Badge> }
        ]

  function acciones(fila: Fila): React.JSX.Element {
    const id = num(fila.id)
    const numero = txt(fila.numero) || txt(fila.concepto) || `#${id}`
    const pendiente = ['PENDIENTE', 'PARCIAL', ''].includes(txt(fila.estado))
    return (
      <div className="flex justify-end gap-1">
        {tab === 'gastos' && <Accion icono={<Eye size={15} />} etiqueta="Ver detalle del gasto" onClick={() => void verDetalle(id)} />}
        {tab === 'gastos' && can('gastos.aprobar') && pendiente && !esAnulado(fila) && (
          <Accion icono={<Wallet size={15} />} etiqueta="Pagar gasto pendiente" tono="success"
            onClick={() => abrirPago('gasto', id, numero)} />
        )}
        {tab === 'gastos' && can('gastos.anular') && !esAnulado(fila) && !['PAGADO', 'APLICADO'].includes(txt(fila.estado)) && (
          <Accion icono={<span className="text-sm font-bold">×</span>} etiqueta="Anular gasto" tono="danger"
            onClick={() => { setAnular({ id, numero }); setMotivo('') }} />
        )}
        {tab === 'recurrentes' && can('gastos.crear') && !esAnulado(fila) &&
          !(fila.activa === false || num(fila.activa) === 0) && (
            <Accion icono={<RotateCw size={15} />} etiqueta="Generar gasto desde recurrente" tono="info"
              onClick={() => void generarRecurrente(id)} />
          )}
        {tab === 'comisiones' && can('gastos.aprobar') && pendiente && (
          <Accion icono={<Wallet size={15} />} etiqueta="Pagar comisión" tono="success"
            onClick={() => abrirPago('comision', id, numero)} />
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Gastos y Comisiones"
        subtitle="Gastos operativos, categorías, cargos recurrentes y comisiones de vendedores."
        actions={
          <>
            <Accion icono={<RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />} etiqueta="Actualizar listados" onClick={() => void cargar()} />
            {can('gastos.crear') && (
              <>
                {tab === 'gastos' && (
                  <Button onClick={() => { setFormGasto(gastoVacio(categorias, catalogos.proveedores)); setGastoOpen(true) }}
                    title="Registrar gasto" aria-label="Registrar gasto">
                    <FilePlus2 size={14} /> Nuevo gasto
                  </Button>
                )}
                {tab === 'categorias' && (
                  <Button onClick={() => { setFormCategoria(categoriaVacia()); setCategoriaOpen(true) }}
                    title="Registrar categoría de gasto" aria-label="Registrar categoría de gasto">
                    <FilePlus2 size={14} /> Nueva categoría
                  </Button>
                )}
                {tab === 'recurrentes' && (
                  <Button onClick={() => { setFormRecurrente(recurrenteVacio(categorias, catalogos.proveedores)); setRecurrenteOpen(true) }}
                    title="Registrar gasto recurrente" aria-label="Registrar gasto recurrente">
                    <FilePlus2 size={14} /> Nuevo recurrente
                  </Button>
                )}
                {tab === 'comisiones' && (
                  <Button onClick={() => { setFormComision(comisionVacia(catalogos.vendedores)); setComisionOpen(true) }}
                    title="Registrar comisión" aria-label="Registrar comisión">
                    <FilePlus2 size={14} /> Nueva comisión
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'gastos', label: 'Gastos' },
          { id: 'categorias', label: 'Categorías' },
          { id: 'recurrentes', label: 'Recurrentes' },
          { id: 'comisiones', label: 'Comisiones' }
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
          entidades={tab === 'comisiones' ? catalogos.vendedores : catalogos.proveedores}
          entidadLabel={tab === 'comisiones' ? 'Vendedor' : 'Proveedor'}
          estados={['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO']}
        />

        <Card
          title={tab === 'gastos' ? 'Gastos registrados' : tab === 'categorias' ? 'Categorías de gasto' : tab === 'recurrentes' ? 'Gastos recurrentes' : 'Comisiones'}
          subtitle={`${tab === 'categorias' ? categorias.length : visibles.length} resultado(s)`}
        >
          <DataTable
            columns={columnas}
            data={tab === 'categorias' ? categorias : visibles}
            rowKey={(f) => num(f.id)}
            searchPlaceholder="Buscar por concepto, categoría o proveedor…"
            emptyText={cargando ? 'Cargando…' : 'No hay registros con estos filtros.'}
            actions={acciones}
          />
        </Card>
      </TabPanel>

      <Modal
        open={gastoOpen}
        title="Nuevo gasto"
        onClose={() => setGastoOpen(false)}
        width="max-w-4xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGastoOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarGasto()} disabled={guardando} title="Registrar gasto" aria-label="Registrar gasto">Registrar gasto</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Categoría *">
            <select className={inputClass} value={formGasto.categoriaId}
              onChange={(e) => setFormGasto({ ...formGasto, categoriaId: e.target.value })} aria-label="Categoría de gasto">
              {opciones(categorias, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Proveedor">
            <select className={inputClass} value={formGasto.proveedorId}
              onChange={(e) => setFormGasto({ ...formGasto, proveedorId: e.target.value })} aria-label="Proveedor">
              {opciones(catalogos.proveedores, 'Sin proveedor').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha"><TextInput type="date" value={formGasto.fecha}
            onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })} /></Field>
          <Field label="Concepto *" className="sm:col-span-3"><TextInput value={formGasto.concepto} maxLength={200}
            onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })} placeholder="Descripción del gasto" /></Field>
          <Field label="Monto RD$ *"><TextInput type="number" min="0" step="0.01" value={formGasto.monto}
            onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })} /></Field>
          <Field label="Impuesto RD$"><TextInput type="number" min="0" step="0.01" value={formGasto.impuesto}
            onChange={(e) => setFormGasto({ ...formGasto, impuesto: e.target.value })} /></Field>
          <Field label="Documento de referencia"><TextInput value={formGasto.docReferencia} maxLength={80}
            onChange={(e) => setFormGasto({ ...formGasto, docReferencia: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          <SelectorMetodo
            metodo={formGasto.metodo}
            onMetodo={(metodo) => setFormGasto({ ...formGasto, metodo: metodo as FormularioGasto['metodo'] })}
            metodos={metodosGasto}
            sesiones={sesiones}
            cajaSesionId={formGasto.cajaSesionId}
            onCajaSesionId={(cajaSesionId) => setFormGasto({ ...formGasto, cajaSesionId })}
            cuentas={catalogos.bancosCuentas}
            bancoCuentaId={formGasto.bancoCuentaId}
            onBancoCuentaId={(bancoCuentaId) => setFormGasto({ ...formGasto, bancoCuentaId })}
          />
        </div>
        <div className="mt-3">
          <Field label="Gasto recurrente de origen" hint="Opcional; vincula el gasto con su configuración recurrente.">
            <select className={inputClass} value={formGasto.recurrenteId}
              onChange={(e) => setFormGasto({ ...formGasto, recurrenteId: e.target.value })} aria-label="Gasto recurrente de origen">
              {opciones(recurrentes, 'Sin recurrente').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={categoriaOpen}
        title="Nueva categoría de gasto"
        onClose={() => setCategoriaOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoriaOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarCategoria()} disabled={guardando} title="Guardar categoría" aria-label="Guardar categoría">Guardar categoría</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código *"><TextInput value={formCategoria.codigo} maxLength={30}
            onChange={(e) => setFormCategoria({ ...formCategoria, codigo: e.target.value })} /></Field>
          <Field label="Nombre *"><TextInput value={formCategoria.nombre} maxLength={100}
            onChange={(e) => setFormCategoria({ ...formCategoria, nombre: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={formCategoria.activa}
              onChange={(e) => setFormCategoria({ ...formCategoria, activa: e.target.checked })} aria-label="Categoría activa" />
            Categoría activa
          </label>
        </div>
      </Modal>

      <Modal
        open={recurrenteOpen}
        title="Nuevo gasto recurrente"
        onClose={() => setRecurrenteOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecurrenteOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarRecurrente()} disabled={guardando} title="Guardar recurrente" aria-label="Guardar recurrente">Guardar recurrente</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Categoría *">
            <select className={inputClass} value={formRecurrente.categoriaId}
              onChange={(e) => setFormRecurrente({ ...formRecurrente, categoriaId: e.target.value })} aria-label="Categoría de gasto">
              {opciones(categorias, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Proveedor">
            <select className={inputClass} value={formRecurrente.proveedorId}
              onChange={(e) => setFormRecurrente({ ...formRecurrente, proveedorId: e.target.value })} aria-label="Proveedor">
              {opciones(catalogos.proveedores, 'Sin proveedor').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Concepto *"><TextInput value={formRecurrente.concepto} maxLength={200}
            onChange={(e) => setFormRecurrente({ ...formRecurrente, concepto: e.target.value })} /></Field>
          <Field label="Monto RD$ *"><TextInput type="number" min="0" step="0.01" value={formRecurrente.monto}
            onChange={(e) => setFormRecurrente({ ...formRecurrente, monto: e.target.value })} /></Field>
          <Field label="Impuesto RD$"><TextInput type="number" min="0" step="0.01" value={formRecurrente.impuesto}
            onChange={(e) => setFormRecurrente({ ...formRecurrente, impuesto: e.target.value })} /></Field>
          <Field label="Frecuencia">
            <select className={inputClass} value={formRecurrente.frecuencia}
              onChange={(e) => setFormRecurrente({ ...formRecurrente, frecuencia: e.target.value as typeof formRecurrente.frecuencia })}
              aria-label="Frecuencia">
              {frecuenciasRecurrentes.map((frecuencia) => <option key={frecuencia} value={frecuencia}>{frecuencia}</option>)}
            </select>
          </Field>
          <Field label="Próxima fecha *"><TextInput type="date" value={formRecurrente.proximaFecha}
            onChange={(e) => setFormRecurrente({ ...formRecurrente, proximaFecha: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={formRecurrente.activa}
              onChange={(e) => setFormRecurrente({ ...formRecurrente, activa: e.target.checked })} aria-label="Recurrente activo" />
            Recurrente activo
          </label>
        </div>
      </Modal>

      <Modal
        open={comisionOpen}
        title="Nueva comisión de vendedor"
        onClose={() => setComisionOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setComisionOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarComision()} disabled={guardando} title="Registrar comisión" aria-label="Registrar comisión">Registrar comisión</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vendedor *">
            <select className={inputClass} value={formComision.vendedorId}
              onChange={(e) => setFormComision({ ...formComision, vendedorId: e.target.value })} aria-label="Vendedor">
              {opciones(catalogos.vendedores, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="ID de la venta *"><TextInput type="number" min="1" value={formComision.docVentaId}
            onChange={(e) => setFormComision({ ...formComision, docVentaId: e.target.value })} /></Field>
          <Field label="Base RD$ *"><TextInput type="number" min="0" step="0.01" value={formComision.base}
            onChange={(e) => setFormComision({ ...formComision, base: e.target.value })} /></Field>
          <Field label="Porcentaje (puntos base)" hint="1000 puntos base = 10 %.">
            <TextInput type="number" min="0" step="1" value={formComision.pctBp}
              onChange={(e) => setFormComision({ ...formComision, pctBp: e.target.value })} />
          </Field>
          <Field label="Fecha"><TextInput type="date" value={formComision.fecha}
            onChange={(e) => setFormComision({ ...formComision, fecha: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={!!pago}
        title={`Pagar ${pago?.tipo === 'gasto' ? 'gasto' : 'comisión'} ${pago?.numero ?? ''}`}
        onClose={() => setPago(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPago(null)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarPago()} disabled={guardando} title="Registrar pago" aria-label="Registrar pago">Registrar pago</Button>
          </>
        }
      >
        {pago && (
          <>
            <SelectorMetodo
              metodo={pago.form.metodo}
              onMetodo={(metodo) => setPago({ ...pago, form: { ...pago.form, metodo } })}
              metodos={metodosGasto}
              sesiones={sesiones}
              cajaSesionId={pago.form.cajaSesionId}
              onCajaSesionId={(cajaSesionId) => setPago({ ...pago, form: { ...pago.form, cajaSesionId } })}
              cuentas={catalogos.bancosCuentas}
              bancoCuentaId={pago.form.bancoCuentaId}
              onBancoCuentaId={(bancoCuentaId) => setPago({ ...pago, form: { ...pago.form, bancoCuentaId } })}
            />
            <div className="mt-3">
              <Field label="Referencia"><TextInput value={pago.form.referencia} maxLength={80}
                onChange={(e) => setPago({ ...pago, form: { ...pago.form, referencia: e.target.value } })} /></Field>
            </div>
          </>
        )}
      </Modal>

      <DetalleFinanzasModal detalle={detalle} titulo="Gasto" onClose={() => setDetalle(null)} />

      <ModalAnulacion
        abierto={!!anular}
        titulo={`Anular gasto ${anular?.numero ?? ''}`}
        descripcion="La anulación deja constancia del motivo y revierte el efecto pendiente."
        motivo={motivo}
        onMotivo={setMotivo}
        onConfirmar={() => void confirmarAnulacion()}
        onClose={() => setAnular(null)}
      />
    </>
  )
}

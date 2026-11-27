import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, FileDown, FilePlus2, Landmark, Printer, RefreshCw } from 'lucide-react'
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
import { normalizarFormato } from '@/lib/formato-impresion'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { AreaImpresionFinanzas } from './AreaImpresionFinanzas'
import {
  Accion, BarraFiltros, DetalleFinanzasModal, ModalAnulacion, SelectorFormato
} from './FinanzasShared'
import { useFinanzasCatalogos } from './useFinanzasCatalogos'
import {
  centavos, conciliacionVacia, cuentaVacia, esAnulado, filtroVacio, formatosDe, movimientoBancoVacio,
  num, numOp, opciones, payloadFiltro, textoOp, tiposMovimientoBanco, txt,
  type DatosImpresionFinanzas, type DetalleFinanzas, type Fila, type FormularioConciliacion,
  type FormularioCuenta, type FormularioMovimientoBanco
} from './types'

function tonoMovimiento(tipo: string): 'success' | 'danger' | 'info' {
  if (['DEPOSITO', 'INTERES'].includes(tipo)) return 'success'
  if (['RETIRO', 'CARGO', 'CHEQUE'].includes(tipo)) return 'danger'
  return 'info'
}

export function BancosPage(): React.JSX.Element {
  const catalogos = useFinanzasCatalogos()
  const [tab, setTab] = useState('cuentas')
  const [cuentas, setCuentas] = useState<Fila[]>([])
  const [movimientos, setMovimientos] = useState<Fila[]>([])
  const [conciliaciones, setConciliaciones] = useState<Fila[]>([])
  const [filtro, setFiltro] = useState(filtroVacio)
  const [aplicado, setAplicado] = useState(filtroVacio)
  const [cargando, setCargando] = useState(true)
  const [formato, setFormato] = useState('CARTA')
  const [cuentaOpen, setCuentaOpen] = useState(false)
  const [formCuenta, setFormCuenta] = useState<FormularioCuenta>(cuentaVacia)
  const [movimientoOpen, setMovimientoOpen] = useState(false)
  const [formMovimiento, setFormMovimiento] = useState<FormularioMovimientoBanco>(() => movimientoBancoVacio([]))
  const [conciliacionOpen, setConciliacionOpen] = useState(false)
  const [formConciliacion, setFormConciliacion] = useState<FormularioConciliacion>(() => conciliacionVacia([]))
  const [movimientosConciliar, setMovimientosConciliar] = useState<Fila[]>([])
  const [detalle, setDetalle] = useState<DetalleFinanzas | null>(null)
  const [detalleTitulo, setDetalleTitulo] = useState('Banco')
  const [impresion, setImpresion] = useState<DatosImpresionFinanzas | null>(null)
  const [anular, setAnular] = useState<{ id: number; numero: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [cuentasRes, movimientosRes, conciliacionesRes] = await Promise.all([
        window.api.invoke<Fila[]>('bancos.cuentas', payloadFiltro(aplicado)),
        window.api.invoke<Fila[]>('bancos.movimientos', payloadFiltro(aplicado, ['cuentaId'])),
        window.api.invoke<Fila[]>('bancos.conciliaciones', payloadFiltro(aplicado))
      ])
      setCuentas(Array.isArray(cuentasRes) ? cuentasRes : [])
      setMovimientos(Array.isArray(movimientosRes) ? movimientosRes : [])
      setConciliaciones(Array.isArray(conciliacionesRes) ? conciliacionesRes : [])
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [aplicado])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    if (!conciliacionOpen || !formConciliacion.cuentaId) {
      setMovimientosConciliar([])
      return
    }
    let activo = true
    window.api.invoke<Fila[]>('bancos.movimientos', {
      cuentaId: num(formConciliacion.cuentaId), limite: 1000
    }).then((res) => {
      if (activo) setMovimientosConciliar(Array.isArray(res) ? res : [])
    }).catch(() => { if (activo) setMovimientosConciliar([]) })
    return () => { activo = false }
  }, [conciliacionOpen, formConciliacion.cuentaId])

  const nombreCuenta = (id: number): string => {
    const cuenta = cuentas.find((item) => num(item.id) === id)
    return cuenta ? txt(cuenta.nombre) || txt(cuenta.codigo) : `#${id}`
  }

  const movimientosVisibles = useMemo(() => movimientos.filter((fila) =>
    (!aplicado.estado || txt(fila.estado) === aplicado.estado) &&
    (!aplicado.desde || txt(fila.fecha) >= aplicado.desde) &&
    (!aplicado.hasta || txt(fila.fecha) <= aplicado.hasta)
  ), [movimientos, aplicado])

  async function guardarCuenta(): Promise<void> {
    if (!formCuenta.codigo.trim() || !formCuenta.nombre.trim()) {
      toast.warning('Código y nombre de la cuenta son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      await window.api.invoke('bancos.cuenta.crear', {
        codigo: formCuenta.codigo.trim(),
        nombre: formCuenta.nombre.trim(),
        banco: textoOp(formCuenta.banco),
        numeroCuenta: textoOp(formCuenta.numeroCuenta),
        tipo: textoOp(formCuenta.tipo),
        saldoInicialCent: centavos(formCuenta.saldoInicial),
        activa: formCuenta.activa
      })
      toast.success('Cuenta bancaria creada correctamente.')
      setCuentaOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarMovimiento(): Promise<void> {
    if (!num(formMovimiento.cuentaId)) { toast.warning('Seleccione la cuenta bancaria.'); return }
    const montoCent = centavos(formMovimiento.monto)
    if (montoCent === 0) { toast.warning('El monto no puede ser cero; use signo negativo para retiros o cargos.'); return }
    setGuardando(true)
    try {
      await window.api.invoke('bancos.movimiento.crear', {
        cuentaId: num(formMovimiento.cuentaId),
        fecha: formMovimiento.fecha,
        tipo: formMovimiento.tipo,
        montoCent,
        referencia: textoOp(formMovimiento.referencia),
        docTipo: textoOp(formMovimiento.docTipo),
        docId: numOp(formMovimiento.docId),
        descripcion: textoOp(formMovimiento.descripcion)
      })
      toast.success('Movimiento bancario registrado correctamente.')
      setMovimientoOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarConciliacion(): Promise<void> {
    if (!num(formConciliacion.cuentaId)) { toast.warning('Seleccione la cuenta bancaria.'); return }
    if (!formConciliacion.movimientoIds.length) { toast.warning('Seleccione al menos un movimiento.'); return }
    setGuardando(true)
    try {
      await window.api.invoke('bancos.conciliacion.crear', {
        cuentaId: num(formConciliacion.cuentaId),
        fecha: formConciliacion.fecha,
        periodoDesde: textoOp(formConciliacion.periodoDesde),
        periodoHasta: textoOp(formConciliacion.periodoHasta),
        saldoBancoCent: centavos(formConciliacion.saldoBanco),
        observaciones: textoOp(formConciliacion.observaciones),
        movimientoIds: formConciliacion.movimientoIds
      })
      toast.success('Conciliación registrada correctamente.')
      setConciliacionOpen(false)
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
      await window.api.invoke('bancos.movimiento.anular', { id: anular.id, motivo: motivo.trim() })
      toast.success(`Movimiento ${anular.numero} anulado.`)
      setAnular(null)
      setMotivo('')
      setDetalle(null)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function imprimir(id: number): Promise<void> {
    try {
      setImpresion(await window.api.invoke<DatosImpresionFinanzas>('bancos.imprimir.datos', { id, formato }))
      if (!await imprimirDocumento('BANCO', { formato: normalizarFormato(formato) })) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfBanco(id: number): Promise<void> {
    try {
      await guardarPdf({ origen: 'banco', id, formato })
      toast.success('PDF generado y descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  function verDetalle(fila: Fila, titulo: string): void {
    setDetalle({
      cabecera: fila,
      movimientos: tab === 'cuentas'
        ? movimientos.filter((item) => num(item.cuentaId) === num(fila.id))
        : []
    })
    setDetalleTitulo(titulo)
  }

  const columnas: Column<Fila>[] = tab === 'cuentas'
    ? [
      { key: 'codigo', header: 'Código', value: (f) => txt(f.codigo) },
      { key: 'nombre', header: 'Cuenta', value: (f) => txt(f.nombre), render: (f) => <span className="font-medium">{txt(f.nombre)}</span> },
      { key: 'banco', header: 'Banco', value: (f) => txt(f.banco) || '—' },
      { key: 'numeroCuenta', header: 'Número', value: (f) => txt(f.numeroCuenta) || '—' },
      {
        key: 'saldoCent', header: 'Saldo',
        value: (f) => num(f.saldoCent) || num(f.saldoActualCent) || num(f.saldoInicialCent),
        render: (f) => <span className="tabular-nums">{money(num(f.saldoCent) || num(f.saldoActualCent) || num(f.saldoInicialCent))}</span>
      },
      {
        key: 'activa', header: 'Estado',
        value: (f) => (f.activa === false || num(f.activa) === 0 ? 'Inactiva' : 'Activa'),
        render: (f) => <Badge tone={f.activa === false || num(f.activa) === 0 ? 'neutral' : 'success'}>
          {f.activa === false || num(f.activa) === 0 ? 'Inactiva' : 'Activa'}
        </Badge>
      }
    ]
    : tab === 'movimientos'
      ? [
        { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
        { key: 'cuenta', header: 'Cuenta', value: (f) => nombreCuenta(num(f.cuentaId)) },
        {
          key: 'tipo', header: 'Tipo', value: (f) => txt(f.tipo),
          render: (f) => <Badge tone={tonoMovimiento(txt(f.tipo))}>{txt(f.tipo)}</Badge>
        },
        { key: 'referencia', header: 'Referencia', value: (f) => txt(f.referencia) || '—' },
        { key: 'descripcion', header: 'Descripción', value: (f) => txt(f.descripcion) || '—' },
        {
          key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent),
          render: (f) => <span className={`tabular-nums ${num(f.montoCent) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {money(num(f.montoCent))}
          </span>
        }
      ]
      : [
        { key: 'numero', header: 'Conciliación', value: (f) => txt(f.numero) || `#${num(f.id)}` },
        { key: 'cuenta', header: 'Cuenta', value: (f) => nombreCuenta(num(f.cuentaId)) },
        { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
        { key: 'periodo', header: 'Período', value: (f) => txt(f.periodoDesde) || txt(f.periodoHasta) ? `${txt(f.periodoDesde)} – ${txt(f.periodoHasta)}` : '—' },
        { key: 'saldoBancoCent', header: 'Saldo banco', value: (f) => num(f.saldoBancoCent), render: (f) => <span className="tabular-nums">{money(num(f.saldoBancoCent))}</span> },
        { key: 'estado', header: 'Estado', value: (f) => txt(f.estado) || 'REGISTRADA', render: (f) => <Badge tone="info">{txt(f.estado) || 'REGISTRADA'}</Badge> }
      ]

  function acciones(fila: Fila): React.JSX.Element {
    const id = num(fila.id)
    return (
      <div className="flex justify-end gap-1">
        <Accion icono={<Eye size={15} />} etiqueta="Ver detalle" onClick={() => verDetalle(fila, 'Banco')} />
        {can('bancos.imprimir') && tab !== 'conciliaciones' && (
          <>
            <Accion icono={<Printer size={15} />} etiqueta="Imprimir comprobante" tono="info" onClick={() => void imprimir(id)} />
            <Accion icono={<FileDown size={15} />} etiqueta="Guardar PDF" tono="info" onClick={() => void guardarPdfBanco(id)} />
          </>
        )}
        {can('bancos.anular') && tab === 'movimientos' && !esAnulado(fila) && (
          <Accion icono={<span className="text-sm font-bold">×</span>} etiqueta="Anular movimiento" tono="danger"
            onClick={() => { setAnular({ id, numero: txt(fila.referencia) || `#${id}` }); setMotivo('') }} />
        )}
      </div>
    )
  }

  const totalSeleccionado = formConciliacion.movimientoIds.reduce((suma, id) =>
    suma + num(movimientosConciliar.find((item) => num(item.id) === id)?.montoCent), 0)

  return (
    <>
      <PageHeader
        title="Bancos"
        subtitle="Cuentas, movimientos con monto firmado y conciliaciones contra el saldo del banco."
        actions={
          <>
            <Accion icono={<RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />} etiqueta="Actualizar listados" onClick={() => void cargar()} />
            {can('bancos.imprimir') && <SelectorFormato value={formato} onChange={setFormato} formatos={formatosDe(catalogos)} />}
            {can('bancos.crear') && (
              <>
                {tab === 'cuentas' && (
                  <Button onClick={() => { setFormCuenta(cuentaVacia()); setCuentaOpen(true) }}
                    title="Registrar cuenta bancaria" aria-label="Registrar cuenta bancaria">
                    <Landmark size={14} /> Nueva cuenta
                  </Button>
                )}
                {tab === 'movimientos' && (
                  <Button onClick={() => { setFormMovimiento(movimientoBancoVacio(catalogos.bancosCuentas)); setMovimientoOpen(true) }}
                    title="Registrar movimiento bancario" aria-label="Registrar movimiento bancario">
                    <FilePlus2 size={14} /> Nuevo movimiento
                  </Button>
                )}
                {tab === 'conciliaciones' && (
                  <Button onClick={() => { setFormConciliacion(conciliacionVacia(catalogos.bancosCuentas)); setConciliacionOpen(true) }}
                    title="Registrar conciliación bancaria" aria-label="Registrar conciliación bancaria">
                    <FilePlus2 size={14} /> Nueva conciliación
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'cuentas', label: 'Cuentas' },
          { id: 'movimientos', label: 'Movimientos' },
          { id: 'conciliaciones', label: 'Conciliaciones' }
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
          entidades={[]}
          extra={{ clave: 'cuentaId', etiqueta: 'Cuenta', items: catalogos.bancosCuentas }}
        />

        <Card
          title={tab === 'cuentas' ? 'Cuentas bancarias' : tab === 'movimientos' ? 'Movimientos bancarios' : 'Conciliaciones'}
          subtitle={`${(tab === 'cuentas' ? cuentas : tab === 'movimientos' ? movimientosVisibles : conciliaciones).length} resultado(s)`}
        >
          <DataTable
            columns={columnas}
            data={tab === 'cuentas' ? cuentas : tab === 'movimientos' ? movimientosVisibles : conciliaciones}
            rowKey={(f) => num(f.id)}
            searchPlaceholder="Buscar por cuenta, referencia o tipo…"
            loading={cargando}
            emptyText='No hay registros con estos filtros.'
            actions={acciones}
          />
        </Card>
      </TabPanel>

      <Modal
        open={cuentaOpen}
        title="Nueva cuenta bancaria"
        onClose={() => setCuentaOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCuentaOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarCuenta()} disabled={guardando} title="Guardar cuenta" aria-label="Guardar cuenta">Guardar cuenta</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código *"><TextInput value={formCuenta.codigo} maxLength={30}
            onChange={(e) => setFormCuenta({ ...formCuenta, codigo: e.target.value })} /></Field>
          <Field label="Nombre *"><TextInput value={formCuenta.nombre} maxLength={100}
            onChange={(e) => setFormCuenta({ ...formCuenta, nombre: e.target.value })} /></Field>
          <Field label="Banco"><TextInput value={formCuenta.banco} maxLength={100}
            onChange={(e) => setFormCuenta({ ...formCuenta, banco: e.target.value })} /></Field>
          <Field label="Número de cuenta"><TextInput value={formCuenta.numeroCuenta} maxLength={50}
            onChange={(e) => setFormCuenta({ ...formCuenta, numeroCuenta: e.target.value })} /></Field>
          <Field label="Tipo"><TextInput value={formCuenta.tipo} maxLength={40}
            onChange={(e) => setFormCuenta({ ...formCuenta, tipo: e.target.value })} placeholder="Ahorros / Corriente" /></Field>
          <Field label="Saldo inicial RD$"><TextInput type="number" step="0.01" value={formCuenta.saldoInicial}
            onChange={(e) => setFormCuenta({ ...formCuenta, saldoInicial: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={formCuenta.activa}
              onChange={(e) => setFormCuenta({ ...formCuenta, activa: e.target.checked })} aria-label="Cuenta activa" />
            Cuenta activa
          </label>
        </div>
      </Modal>

      <Modal
        open={movimientoOpen}
        title="Nuevo movimiento bancario"
        onClose={() => setMovimientoOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMovimientoOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarMovimiento()} disabled={guardando} title="Registrar movimiento" aria-label="Registrar movimiento">Registrar movimiento</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cuenta *">
            <select className={inputClass} value={formMovimiento.cuentaId}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, cuentaId: e.target.value })} aria-label="Cuenta bancaria">
              {opciones(catalogos.bancosCuentas, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha"><TextInput type="date" value={formMovimiento.fecha}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, fecha: e.target.value })} /></Field>
          <Field label="Tipo">
            <select className={inputClass} value={formMovimiento.tipo}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, tipo: e.target.value as typeof formMovimiento.tipo })}
              aria-label="Tipo de movimiento">
              {tiposMovimientoBanco.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </Field>
          <Field label="Monto RD$ *" hint="Use signo negativo para retiros, cargos o ajustes a la baja.">
            <TextInput type="number" step="0.01" value={formMovimiento.monto}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, monto: e.target.value })} />
          </Field>
          <Field label="Referencia"><TextInput value={formMovimiento.referencia} maxLength={80}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, referencia: e.target.value })} /></Field>
          <Field label="Descripción"><TextInput value={formMovimiento.descripcion} maxLength={300}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, descripcion: e.target.value })} /></Field>
          <Field label="Tipo de documento"><TextInput value={formMovimiento.docTipo} maxLength={40}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, docTipo: e.target.value })} placeholder="FACTURA, RECIBO…" /></Field>
          <Field label="ID del documento"><TextInput type="number" min="1" value={formMovimiento.docId}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, docId: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={conciliacionOpen}
        title="Nueva conciliación bancaria"
        onClose={() => setConciliacionOpen(false)}
        width="max-w-4xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConciliacionOpen(false)} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarConciliacion()} disabled={guardando} title="Registrar conciliación" aria-label="Registrar conciliación">Registrar conciliación</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Cuenta *">
            <select className={inputClass} value={formConciliacion.cuentaId}
              onChange={(e) => setFormConciliacion({
                ...formConciliacion, cuentaId: e.target.value, movimientoIds: []
              })} aria-label="Cuenta bancaria">
              {opciones(catalogos.bancosCuentas, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha"><TextInput type="date" value={formConciliacion.fecha}
            onChange={(e) => setFormConciliacion({ ...formConciliacion, fecha: e.target.value })} /></Field>
          <Field label="Desde"><TextInput type="date" value={formConciliacion.periodoDesde}
            onChange={(e) => setFormConciliacion({ ...formConciliacion, periodoDesde: e.target.value })} /></Field>
          <Field label="Hasta"><TextInput type="date" value={formConciliacion.periodoHasta}
            onChange={(e) => setFormConciliacion({ ...formConciliacion, periodoHasta: e.target.value })} /></Field>
          <Field label="Saldo según banco RD$"><TextInput type="number" step="0.01" value={formConciliacion.saldoBanco}
            onChange={(e) => setFormConciliacion({ ...formConciliacion, saldoBanco: e.target.value })} /></Field>
          <Field label="Observaciones" className="sm:col-span-3"><TextInput value={formConciliacion.observaciones} maxLength={500}
            onChange={(e) => setFormConciliacion({ ...formConciliacion, observaciones: e.target.value })} /></Field>
        </div>

        <p className="mb-2 mt-4 text-xs font-medium text-slate-500">
          Movimientos a conciliar · {formConciliacion.movimientoIds.length} seleccionado(s) · Total {money(totalSeleccionado)}
        </p>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
          {movimientosConciliar.map((movimiento) => {
            const id = num(movimiento.id)
            const seleccionado = formConciliacion.movimientoIds.includes(id)
            return (
              <label key={id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={seleccionado}
                  onChange={(e) => setFormConciliacion({
                    ...formConciliacion,
                    movimientoIds: e.target.checked
                      ? [...formConciliacion.movimientoIds, id]
                      : formConciliacion.movimientoIds.filter((value) => value !== id)
                  })} aria-label={`Conciliar movimiento ${txt(movimiento.referencia) || `#${id}`}`} />
                <span className="w-24 shrink-0 text-slate-500">{txt(movimiento.fecha)}</span>
                <span className="min-w-0 flex-1 truncate">{txt(movimiento.tipo)} · {txt(movimiento.descripcion) || txt(movimiento.referencia) || `#${id}`}</span>
                <span className="tabular-nums">{money(num(movimiento.montoCent))}</span>
              </label>
            )
          })}
          {!movimientosConciliar.length && (
            <p className="px-3 py-6 text-center text-xs text-slate-400">Seleccione una cuenta con movimientos disponibles.</p>
          )}
        </div>
      </Modal>

      <DetalleFinanzasModal
        detalle={detalle}
        titulo={detalleTitulo}
        onClose={() => setDetalle(null)}
        onPrint={detalle ? () => void imprimir(num(detalle.cabecera.id)) : undefined}
        puedeImprimir={detalle ? can('bancos.imprimir') : false}
      />

      <ModalAnulacion
        abierto={!!anular}
        titulo={`Anular movimiento ${anular?.numero ?? ''}`}
        descripcion="La anulación conserva la auditoría y ajusta el saldo de la cuenta."
        motivo={motivo}
        onMotivo={setMotivo}
        onConfirmar={() => void confirmarAnulacion()}
        onClose={() => setAnular(null)}
      />

      <AreaImpresionFinanzas datos={impresion} />
    </>
  )
}

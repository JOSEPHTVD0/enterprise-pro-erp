import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, FileDown, FilePlus2, LockKeyhole, Printer, RefreshCw, UnlockKeyhole } from 'lucide-react'
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
import { confirmarAccion, money, titleSi, usePreferenciasInterfaz } from '@/lib/format'
import { formatoPreferido, normalizarFormato, opcionesImpresion } from '@/lib/formato-impresion'
import { imprimirDocumento } from '@/lib/impresion'
import { guardarPdf } from '@/lib/pdf'
import { AreaImpresionFinanzas } from './AreaImpresionFinanzas'
import {
  Accion, BarraFiltros, DetalleFinanzasModal, SelectorFormato
} from './FinanzasShared'
import { useFinanzasCatalogos } from './useFinanzasCatalogos'
import {
  aperturaVacia, centavos, cierreVacio, filtroVacio, formatosDe, metodosDe, movimientoCajaVacio,
  num, opciones, payloadFiltro, textoOp, txt, type DatosImpresionFinanzas, type DetalleFinanzas,
  type Fila, type FormularioApertura, type FormularioCierre, type FormularioMovimientoCaja
} from './types'

/** Monto teórico disponible en una sesión, según los campos que exponga el backend. */
function esperadoCent(sesion: Fila): number {
  for (const clave of ['saldoTeoricoCent', 'montoTeoricoCent', 'montoEsperadoCent', 'saldoCalculadoCent']) {
    if (sesion[clave] !== undefined && sesion[clave] !== null) return num(sesion[clave])
  }
  return num(sesion.montoAperturaCent) + num(sesion.ingresosCent) - num(sesion.egresosCent) || num(sesion.montoCent)
}

export function CajasPage(): React.JSX.Element {
  const catalogos = useFinanzasCatalogos()
  const [tab, setTab] = useState('sesiones')
  const [sesiones, setSesiones] = useState<Fila[]>([])
  const [movimientosSesion, setMovimientosSesion] = useState<Fila[]>([])
  const [sesionId, setSesionId] = useState('')
  const [filtro, setFiltro] = useState(filtroVacio)
  const [aplicado, setAplicado] = useState(filtroVacio)
  const [cargando, setCargando] = useState(true)
  const [formato, setFormato] = useState<string>(formatoPreferido)
  const [cierreAutomatico, setCierreAutomatico] = useState(false)
  const [aperturaOpen, setAperturaOpen] = useState(false)
  const [formApertura, setFormApertura] = useState<FormularioApertura>(() => aperturaVacia([]))
  const [cierreOpen, setCierreOpen] = useState(false)
  const [formCierre, setFormCierre] = useState<FormularioCierre>(() => cierreVacio(0, ''))
  const [movimientoOpen, setMovimientoOpen] = useState(false)
  const [formMovimiento, setFormMovimiento] = useState<FormularioMovimientoCaja>(() => movimientoCajaVacio([]))
  const [detalle, setDetalle] = useState<DetalleFinanzas | null>(null)
  const [detalleTitulo, setDetalleTitulo] = useState('Caja')
  const [impresion, setImpresion] = useState<DatosImpresionFinanzas | null>(null)
  const [guardando, setGuardando] = useState(false)
  const preferencias = usePreferenciasInterfaz()
  const title = (texto: string): string | undefined => titleSi(preferencias.tooltips, texto)

  // Canal dedicado: si no existe o no hay permiso, se mantiene la confirmación manual.
  useEffect(() => {
    let activo = true
    void window.api.invoke<boolean>('cajas.cierreAutomatico')
      .then((valor) => { if (activo) setCierreAutomatico(Boolean(valor)) })
      .catch(() => { if (activo) setCierreAutomatico(false) })
    return () => { activo = false }
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await window.api.invoke<Fila[]>('cajas.sesiones', payloadFiltro(aplicado, ['cajaId']))
      const lista = Array.isArray(res) ? res : []
      setSesiones(lista)
      if (!sesionId || !lista.some((item) => num(item.id) === num(sesionId))) {
        setSesionId(lista[0] ? String(num(lista[0].id)) : '')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [aplicado, sesionId])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    if (!sesionId) { setMovimientosSesion([]); return }
    let activo = true
    window.api.invoke<DetalleFinanzas>('cajas.detalle', num(sesionId))
      .then((res) => { if (activo) setMovimientosSesion(res?.movimientos ?? []) })
      .catch(() => { if (activo) setMovimientosSesion([]) })
    return () => { activo = false }
  }, [sesionId])

  const abiertas = useMemo(() => sesiones.filter((fila) => {
    const estado = txt(fila.estado).toUpperCase()
    return !estado || estado === 'ABIERTA'
  }), [sesiones])

  async function verDetalle(id: number, titulo = 'Caja'): Promise<void> {
    try {
      setDetalle(await window.api.invoke<DetalleFinanzas>('cajas.detalle', id))
      setDetalleTitulo(titulo)
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarApertura(): Promise<void> {
    if (!num(formApertura.cajaId)) { toast.warning('Seleccione la caja.'); return }
    setGuardando(true)
    try {
      await window.api.invoke('cajas.abrir', {
        cajaId: num(formApertura.cajaId),
        montoCent: centavos(formApertura.monto),
        observaciones: textoOp(formApertura.observaciones)
      })
      toast.success('Sesión de caja abierta correctamente.')
      setAperturaOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarCierre(form: FormularioCierre = formCierre): Promise<void> {
    if (!form.sesionId) { toast.warning('Seleccione una sesión abierta.'); return }
    setGuardando(true)
    try {
      await window.api.invoke('cajas.cerrar', {
        sesionId: form.sesionId,
        arqueoEfectivoCent: centavos(form.arqueoEfectivo),
        arqueoOtrosCent: centavos(form.arqueoOtros),
        observaciones: textoOp(form.observaciones)
      })
      toast.success('Sesión de caja cerrada con su arqueo.')
      setCierreOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  /** El cierre automático solo omite la confirmación; el permiso se valida en backend. */
  function iniciarCierre(id: number, referencia: string): void {
    const form = cierreVacio(id, referencia)
    setFormCierre(form)
    if (cierreAutomatico) {
      void guardarCierre(form)
      return
    }
    if (!confirmarAccion(`¿Cerrar la sesión ${referencia}? Se registrará el arqueo indicado.`)) return
    setCierreOpen(true)
  }

  async function guardarMovimiento(): Promise<void> {
    if (!num(formMovimiento.sesionId)) { toast.warning('Seleccione una sesión abierta.'); return }
    const montoCent = centavos(formMovimiento.monto)
    if (montoCent <= 0) { toast.warning('El monto debe ser mayor que cero.'); return }
    if (!formMovimiento.descripcion.trim()) { toast.warning('Indique la descripción del movimiento.'); return }
    setGuardando(true)
    try {
      await window.api.invoke('cajas.movimiento.crear', {
        sesionId: num(formMovimiento.sesionId),
        tipo: formMovimiento.tipo,
        metodo: formMovimiento.metodo,
        montoCent,
        descripcion: formMovimiento.descripcion.trim()
      })
      toast.success('Movimiento de caja registrado correctamente.')
      setMovimientoOpen(false)
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function imprimir(id: number): Promise<void> {
    if (!opcionesImpresion().impresionAutomatica
      && !confirmarAccion('¿Enviar este comprobante a la impresora configurada?')) return
    try {
      setImpresion(await window.api.invoke<DatosImpresionFinanzas>('cajas.imprimir.datos', { id, formato }))
      if (!await imprimirDocumento('CAJA', { formato: normalizarFormato(formato) })) {
        toast.warning('La impresión fue cancelada.')
      }
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  async function guardarPdfCaja(id: number): Promise<void> {
    try {
      await guardarPdf({ origen: 'caja', id, formato })
      toast.success('PDF generado y descargado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const columnasSesiones: Column<Fila>[] = [
    { key: 'numero', header: 'Sesión', value: (f) => txt(f.numero) || `#${num(f.id)}`, render: (f) => <span className="font-medium">{txt(f.numero) || `#${num(f.id)}`}</span> },
    { key: 'cajaNombre', header: 'Caja', value: (f) => txt(f.cajaNombre) || txt(f.cajaCodigo) || '—' },
    { key: 'fechaApertura', header: 'Apertura', value: (f) => txt(f.fechaApertura) || txt(f.fecha) },
    { key: 'fechaCierre', header: 'Cierre', value: (f) => txt(f.fechaCierre) || '—' },
    { key: 'montoAperturaCent', header: 'Fondo', value: (f) => num(f.montoAperturaCent), render: (f) => <span className="tabular-nums">{money(num(f.montoAperturaCent))}</span> },
    { key: 'saldoCent', header: 'Saldo', value: (f) => num(f.saldoCent), render: (f) => <span className="tabular-nums">{money(num(f.saldoCent))}</span> },
    {
      key: 'estado', header: 'Estado', value: (f) => txt(f.estado) || 'ABIERTA',
      render: (f) => {
        const estado = txt(f.estado) || 'ABIERTA'
        return <Badge tone={estado === 'ABIERTA' ? 'success' : estado === 'CERRADA' ? 'neutral' : 'warning'}>{estado}</Badge>
      }
    }
  ]

  const columnasMovimientos: Column<Fila>[] = [
    { key: 'fecha', header: 'Fecha', value: (f) => txt(f.fecha) },
    { key: 'tipo', header: 'Tipo', value: (f) => txt(f.tipo), render: (f) => <Badge tone={txt(f.tipo) === 'INGRESO' ? 'success' : 'danger'}>{txt(f.tipo)}</Badge> },
    { key: 'metodo', header: 'Método', value: (f) => txt(f.metodo) || '—' },
    { key: 'descripcion', header: 'Descripción', value: (f) => txt(f.descripcion) },
    {
      key: 'montoCent', header: 'Monto', value: (f) => num(f.montoCent),
      render: (f) => <span className={`tabular-nums ${txt(f.tipo) === 'EGRESO' || num(f.montoCent) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {money(num(f.montoCent))}
      </span>
    }
  ]

  const sesionCierre = sesiones.find((fila) => num(fila.id) === formCierre.sesionId)
  const esperadoCierre = sesionCierre ? esperadoCent(sesionCierre) : 0
  const arqueoCierre = centavos(formCierre.arqueoEfectivo) + centavos(formCierre.arqueoOtros)
  const diferenciaCierre = esperadoCierre - arqueoCierre

  return (
    <>
      <PageHeader
        title="Cajas y Cuadre"
        subtitle="Apertura, movimientos manuales, arqueo y cierre de sesiones de caja."
        actions={
          <>
            <Accion icono={<RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />} etiqueta="Actualizar sesiones" onClick={() => void cargar()} />
            {can('cajas.imprimir') && <SelectorFormato value={formato} onChange={setFormato} formatos={formatosDe(catalogos)} />}
            {can('cajas.abrir_caja') && (
              <Button onClick={() => { setFormApertura(aperturaVacia(catalogos.cajas)); setAperturaOpen(true) }}
                title={title('Abrir sesión de caja')} aria-label="Abrir sesión de caja">
                <UnlockKeyhole size={14} /> Abrir caja
              </Button>
            )}
            {can('cajas.cerrar_caja') && abiertas.length > 0 && (
              <Button variant="secondary"
                onClick={() => {
                  const sesion = abiertas[0]
                  iniciarCierre(num(sesion.id), txt(sesion.numero) || `#${num(sesion.id)}`)
                }}
                title={title('Cerrar sesión de caja')} aria-label="Cerrar sesión de caja">
                <LockKeyhole size={14} /> Cerrar caja
              </Button>
            )}
            {can('cajas.crear') && sesionId && (
              <Button onClick={() => { setFormMovimiento(movimientoCajaVacio(abiertas, sesionId)); setMovimientoOpen(true) }}
                title={title('Registrar movimiento manual de caja')} aria-label="Registrar movimiento manual de caja">
                <FilePlus2 size={14} /> Movimiento
              </Button>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'sesiones', label: 'Sesiones' },
          { id: 'movimientos', label: 'Movimientos' }
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
          extra={{ clave: 'cajaId', etiqueta: 'Caja', items: catalogos.cajas }}
        />

        {tab === 'sesiones' ? (
          <Card title="Sesiones de caja" subtitle={`${sesiones.length} resultado(s)`}>
            <DataTable
              columns={columnasSesiones}
              data={sesiones}
              rowKey={(f) => num(f.id)}
              searchPlaceholder="Buscar por número, caja o estado…"
              loading={cargando}
              emptyText='No hay sesiones con estos filtros.'
              actions={(fila) => {
                const id = num(fila.id)
                return (
                  <div className="flex justify-end gap-1">
                    <Accion icono={<Eye size={15} />} etiqueta="Ver detalle de sesión"
                      onClick={() => void verDetalle(id, 'Caja')} />
                    {can('cajas.imprimir') && (
                      <>
                        <Accion icono={<Printer size={15} />} etiqueta="Imprimir cierre de caja" tono="info"
                          onClick={() => void imprimir(id)} />
                        {preferencias.formatosPermitidos.includes('PDF') && (
                          <Accion icono={<FileDown size={15} />} etiqueta="Guardar PDF" tono="info"
                            onClick={() => void guardarPdfCaja(id)} />
                        )}
                      </>
                    )}
                    {can('cajas.cerrar_caja') && (txt(fila.estado) === 'ABIERTA' || !txt(fila.estado)) && (
                      <Accion icono={<LockKeyhole size={15} />} etiqueta="Cerrar esta sesión" tono="danger"
                        onClick={() => iniciarCierre(id, txt(fila.numero) || `#${id}`)} />
                    )}
                  </div>
                )
              }}
            />
          </Card>
        ) : (
          <Card
            title="Movimientos de la sesión"
            subtitle={`${movimientosSesion.length} movimiento(s)`}
            actions={
              <select className={`${inputClass} w-56`} value={sesionId}
                onChange={(e) => setSesionId(e.target.value)} title={title('Sesión de caja')} aria-label="Sesión de caja">
                {sesiones.map((sesion) => (
                  <option key={num(sesion.id)} value={num(sesion.id)}>
                    {txt(sesion.numero) || `#${num(sesion.id)}`} · {txt(sesion.estado) || 'ABIERTA'}
                  </option>
                ))}
              </select>
            }
          >
            <DataTable
              columns={columnasMovimientos}
              data={movimientosSesion}
              rowKey={(f) => num(f.id) || movimientosSesion.indexOf(f)}
              searchPlaceholder="Buscar por descripción o método…"
              emptyText={!sesionId ? 'Abra o seleccione una sesión para ver sus movimientos.' : 'Esta sesión no tiene movimientos.'}
            />
          </Card>
        )}
      </TabPanel>

      <Modal
        open={aperturaOpen}
        title="Abrir sesión de caja"
        onClose={() => setAperturaOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAperturaOpen(false)} title={title('Cancelar')} aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarApertura()} disabled={guardando} title={title('Abrir caja')} aria-label="Abrir caja">Abrir caja</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Caja *">
            <select className={inputClass} value={formApertura.cajaId}
              onChange={(e) => setFormApertura({ ...formApertura, cajaId: e.target.value })} aria-label="Caja">
              {opciones(catalogos.cajas, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fondo inicial RD$"><TextInput type="number" step="0.01" value={formApertura.monto}
            onChange={(e) => setFormApertura({ ...formApertura, monto: e.target.value })} /></Field>
          <Field label="Observaciones" className="sm:col-span-2"><TextInput value={formApertura.observaciones} maxLength={500}
            onChange={(e) => setFormApertura({ ...formApertura, observaciones: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal
        open={cierreOpen}
        title={`Cerrar sesión ${formCierre.referencia}`}
        onClose={() => setCierreOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCierreOpen(false)} title={title('Cancelar')} aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarCierre()} disabled={guardando} title={title('Cerrar caja')} aria-label="Cerrar caja">Cerrar caja</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Arqueo en efectivo RD$ *"><TextInput type="number" step="0.01" value={formCierre.arqueoEfectivo}
            onChange={(e) => setFormCierre({ ...formCierre, arqueoEfectivo: e.target.value })} /></Field>
          <Field label="Arqueo en otros medios RD$"><TextInput type="number" step="0.01" value={formCierre.arqueoOtros}
            onChange={(e) => setFormCierre({ ...formCierre, arqueoOtros: e.target.value })} /></Field>
          <Field label="Observaciones" className="sm:col-span-2"><TextInput value={formCierre.observaciones} maxLength={500}
            onChange={(e) => setFormCierre({ ...formCierre, observaciones: e.target.value })} /></Field>
        </div>
        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-3">
          <div><p className="text-[11px] text-slate-500">Monto esperado</p><p className="font-medium tabular-nums">{money(esperadoCierre)}</p></div>
          <div><p className="text-[11px] text-slate-500">Arqueo total</p><p className="font-medium tabular-nums">{money(arqueoCierre)}</p></div>
          <div>
            <p className="text-[11px] text-slate-500">Diferencia</p>
            <p className={`font-semibold tabular-nums ${diferenciaCierre === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {money(diferenciaCierre)}
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={movimientoOpen}
        title="Movimiento manual de caja"
        onClose={() => setMovimientoOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMovimientoOpen(false)} title={title('Cancelar')} aria-label="Cancelar">Cancelar</Button>
            <Button onClick={() => void guardarMovimiento()} disabled={guardando} title={title('Registrar movimiento')} aria-label="Registrar movimiento">Registrar movimiento</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sesión *">
            <select className={inputClass} value={formMovimiento.sesionId}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, sesionId: e.target.value })} aria-label="Sesión de caja">
              {opciones(abiertas, 'Seleccione…').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select className={inputClass} value={formMovimiento.tipo}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, tipo: e.target.value as typeof formMovimiento.tipo })}
              aria-label="Tipo de movimiento">
              <option value="INGRESO">INGRESO</option>
              <option value="EGRESO">EGRESO</option>
            </select>
          </Field>
          <Field label="Método">
            <select className={inputClass} value={formMovimiento.metodo}
              onChange={(e) => setFormMovimiento({ ...formMovimiento, metodo: e.target.value })} aria-label="Método">
              {metodosDe(catalogos).map((metodo) => <option key={metodo} value={metodo}>{metodo}</option>)}
            </select>
          </Field>
          <Field label="Monto RD$ *"><TextInput type="number" min="0" step="0.01" value={formMovimiento.monto}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, monto: e.target.value })} /></Field>
          <Field label="Descripción *" className="sm:col-span-2"><TextInput value={formMovimiento.descripcion} maxLength={300}
            onChange={(e) => setFormMovimiento({ ...formMovimiento, descripcion: e.target.value })}
            placeholder="Motivo del ingreso o egreso" /></Field>
        </div>
      </Modal>

      <DetalleFinanzasModal
        detalle={detalle}
        titulo={detalleTitulo}
        onClose={() => setDetalle(null)}
        onPrint={detalle ? () => void imprimir(num(detalle.cabecera.id)) : undefined}
        puedeImprimir={detalle ? can('cajas.imprimir') : false}
      />

      <AreaImpresionFinanzas datos={impresion} />
    </>
  )
}

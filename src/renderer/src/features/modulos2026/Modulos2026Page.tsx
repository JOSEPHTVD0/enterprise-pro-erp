import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money, titleSi, usePreferenciasInterfaz } from '@/lib/format'

type Fila = Record<string, unknown>
type Modulo = 'presupuestos' | 'servicios' | 'activos' | 'crm'
const txt = (f: Fila, k: string): string => String(f[k] ?? '')
const num = (f: Fila, k: string): number => Number(f[k] ?? 0)

function Campo({
  label, value, onChange, type = 'text', placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}): React.JSX.Element {
  return (
    <Field label={label}>
      <TextInput type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

function SelectCampo({
  label, value, options, onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

const action = async (channel: string, input?: unknown, mensaje = 'Operación realizada.'): Promise<void> => {
  try {
    await window.api.invoke(channel, input)
    toast.success(mensaje)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'No se pudo completar la operación.')
  }
}

const camposRequeridos: Record<string, string[]> = {
  presupuesto: ['nombre', 'descripcion', 'periodo'],
  ejecutar: ['montoCent'],
  servicio: ['codigo', 'nombre'],
  orden: ['clienteId', 'servicioId', 'cantidad'],
  activo: ['nombre', 'valorAdquisicionCent'],
  depreciar: ['periodo'],
  lead: ['nombre'],
  seguimiento: ['descripcion']
}

function validarFormulario(nombre: string, values: Record<string, string>): boolean {
  for (const clave of camposRequeridos[nombre] ?? []) {
    if (!String(values[clave] ?? '').trim()) {
      toast.warning(`Complete el campo ${clave}.`)
      return false
    }
  }
  const montos = ['montoCent', 'precioCent', 'valorAdquisicionCent', 'valorResidualCent']
  for (const clave of montos) {
    const valor = Number(values[clave] ?? 0)
    if (!Number.isFinite(valor) || valor < 0) {
      toast.warning(`Revise el importe de ${clave}.`)
      return false
    }
  }
  if (nombre === 'presupuesto' && Number(values.montoCent) <= 0) {
    toast.warning('El monto del presupuesto debe ser mayor que cero.')
    return false
  }
  if (nombre === 'ejecutar' && Number(values.montoCent) <= 0) {
    toast.warning('El monto de la ejecución debe ser mayor que cero.')
    return false
  }
  if (nombre === 'activo' && Number(values.valorAdquisicionCent) <= 0) {
    toast.warning('El valor de adquisición debe ser mayor que cero.')
    return false
  }
  if (nombre === 'activo' && Number(values.valorResidualCent || 0) > Number(values.valorAdquisicionCent)) {
    toast.warning('El valor residual no puede superar el valor de adquisición.')
    return false
  }
  return true
}

/** Interfaz de los módulos añadidos en 0.3.0. Cada acción pasa por IPC validado. */
export function Modulos2026Page({ modulo }: { modulo: Modulo }): React.JSX.Element {
  const [filas, setFilas] = useState<Fila[]>([])
  const [catalogo, setCatalogo] = useState<Fila[]>([])
  const [clientes, setClientes] = useState<Fila[]>([])
  const [subTab, setSubTab] = useState('listado')
  const [modal, setModal] = useState('')
  const [seleccionado, setSeleccionado] = useState<Fila | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [detalle, setDetalle] = useState<{ titulo: string; datos: unknown } | null>(null)
  const preferencias = usePreferenciasInterfaz()
  const title = (texto: string): string | undefined => titleSi(preferencias.tooltips, texto)

  const etiquetasEstado: Record<string, string> = {
    RECIBIDA: 'Recibida',
    EN_PROCESO: 'Procesar',
    PENDIENTE_CLIENTE: 'Pendiente cliente',
    FINALIZADA: 'Finalizar',
    ENTREGADA: 'Entregar',
    ANULADA: 'Anular'
  }
  const estadosConfigurados = preferencias.estadosOrden.filter((valor) => valor !== 'ANULADA')
  const esTerminal = (fila: Fila): boolean => ['ANULADA', 'ENTREGADA'].includes(txt(fila, 'estado'))

  const f = (k: string): string => form[k] ?? ''
  const setf = (k: string, v: string): void => setForm((p) => ({ ...p, [k]: v }))

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      const canal: Record<Modulo, string> = {
        presupuestos: 'presupuestos.list', servicios: 'servicios.ordenes',
        activos: 'activos.list', crm: 'crm.leads'
      }
      const [listado, cats, cls] = await Promise.all([
        window.api.invoke<Fila[]>(canal[modulo]),
        window.api.invoke<Fila[]>('maestros.list', { entidad: 'productos', incluirInactivos: false }).catch(() => []),
        window.api.invoke<Fila[]>('maestros.list', { entidad: 'clientes', incluirInactivos: false }).catch(() => [])
      ])
      setFilas(listado ?? [])
      setCatalogo(cats ?? [])
      setClientes(cls ?? [])
      if (modulo === 'servicios') {
        setCatalogo(await window.api.invoke<Fila[]>('servicios.catalogo').catch(() => []))
      }
    } catch {
      setFilas([])
      toast.error('No se pudo cargar el módulo.')
    } finally {
      setCargando(false)
    }
  }, [modulo])

  useEffect(() => { void cargar() }, [cargar])

  const abrir = (nombre: string, fila?: Fila): void => {
    const hoy = new Date().toISOString()
    const defaults: Record<string, Record<string, string>> = {
      presupuesto: { periodo: hoy.slice(0, 7), centroCosto: 'GENERAL', categoria: 'GENERAL' },
      servicio: { duracionMin: '60' },
      orden: { prioridad: 'NORMAL', cantidad: '1', tasaBp: '1800' },
      activo: { categoria: 'EQUIPO', fechaCompra: hoy.slice(0, 10), vidaUtilMeses: '60' },
      depreciar: { periodo: hoy.slice(0, 7) },
      lead: { origen: 'OTRO', probabilidad: '10' }
    }
    setModal(nombre)
    setSeleccionado(fila ?? null)
    setForm(fila
      ? Object.fromEntries(Object.entries(fila).flatMap(([k, v]) => {
        const valor = String(v ?? '')
        const camel = k.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase())
        return camel === k ? [[k, valor]] : [[k, valor], [camel, valor]]
      }))
      : (defaults[nombre] ?? {}))
  }

  const guardar = async (): Promise<void> => {
    if (guardando) return
    if (!validarFormulario(modal, form)) return
    setGuardando(true)
    try {
      if (modal === 'presupuesto') {
        await window.api.invoke('presupuestos.crear', {
          nombre: f('nombre'), periodo: f('periodo') || new Date().toISOString().slice(0, 7),
          centroCosto: f('centroCosto') || 'GENERAL', observaciones: f('observaciones'),
          lineas: [{ categoria: f('categoria') || 'GENERAL', descripcion: f('descripcion'), montoCent: Math.round(Number(f('montoCent')) * 100) }]
        })
      } else if (modal === 'ejecutar') {
        await window.api.invoke('presupuestos.ejecutar', {
          id: num(seleccionado ?? {}, 'id'), montoCent: Math.round(Number(f('montoCent')) * 100), descripcion: f('descripcion')
        })
      } else if (modal === 'servicio') {
        await window.api.invoke('servicios.catalogo.crear', {
          codigo: f('codigo'), nombre: f('nombre'), descripcion: f('descripcion'),
          precioCent: Math.round(Number(f('precioCent')) * 100), duracionMin: Number(f('duracionMin')) || 60,
          activo: true
        })
      } else if (modal === 'orden') {
        await window.api.invoke('servicios.orden.crear', {
          clienteId: Number(f('clienteId')), tecnicoId: undefined,
          fechaCompromiso: f('fechaCompromiso') || '', prioridad: f('prioridad') || 'NORMAL',
          tasaBp: Number(f('tasaBp')) || 1800, diagnostico: f('diagnostico'), observaciones: f('observaciones'),
          lineas: [{ servicioId: Number(f('servicioId')), cantidad: Number(f('cantidad')) || 1 }]
        })
      } else if (modal === 'activo') {
        await window.api.invoke('activos.crear', {
          nombre: f('nombre'), categoria: f('categoria') || 'EQUIPO', codigoInterno: f('codigoInterno'),
          ubicacion: f('ubicacion'), fechaCompra: f('fechaCompra') || new Date().toISOString().slice(0, 10),
          valorAdquisicionCent: Math.round(Number(f('valorAdquisicionCent')) * 100),
          valorResidualCent: Math.round(Number(f('valorResidualCent')) * 100),
          vidaUtilMeses: Number(f('vidaUtilMeses')) || 60, observaciones: f('observaciones')
        })
      } else if (modal === 'depreciar') {
        await window.api.invoke('activos.depreciar', {
          id: num(seleccionado ?? {}, 'id'), periodo: f('periodo') || new Date().toISOString().slice(0, 7),
          ...(f('montoCent') ? { montoCent: Math.round(Number(f('montoCent')) * 100) } : {})
        })
      } else if (modal === 'lead') {
        await window.api.invoke('crm.lead.crear', {
          nombre: f('nombre'), empresa: f('empresa'), rncCedula: f('rncCedula'), telefono: f('telefono'),
          email: f('email'), origen: f('origen') || 'OTRO', probabilidad: Number(f('probabilidad')) || 10,
          valorEstimadoCent: Math.round(Number(f('valorEstimadoCent')) * 100),
          proximoSeguimiento: f('proximoSeguimiento') || '', observaciones: f('observaciones')
        })
      } else if (modal === 'seguimiento') {
        await window.api.invoke('crm.seguimiento.crear', {
          leadId: num(seleccionado ?? {}, 'id'), tipo: f('tipo') || 'LLAMADA',
          descripcion: f('descripcion'), proximoSeguimiento: f('proximoSeguimiento') || ''
        })
      }
      setModal('')
      toast.success('Registro guardado y auditado.')
      await cargar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const verDetalle = async (canal: string, id: number, titulo: string): Promise<void> => {
    try {
      const datos = await window.api.invoke<unknown>(canal, id)
      setDetalle({ titulo, datos })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el detalle.')
    }
  }

  const estado = (fila: Fila, canal: string,valor: string, extra: Record<string, unknown> = {}): void => {
    void action(canal, { id: num(fila, 'id'), estado: valor, ...extra }, `Estado actualizado a ${valor}.`).then(cargar)
  }

  const columnasBase: Column<Fila>[] = [
    { key: 'numero', header: 'Número', value: (r) => txt(r, 'numero') },
    { key: 'estado', header: 'Estado', render: (r) => <Badge tone={txt(r, 'estado') === 'ANULADO' ? 'danger' : 'accent'}>{txt(r, 'estado')}</Badge> }
  ]

  const titulos: Record<Modulo, { title: string; subtitle: string }> = {
    presupuestos: { title: 'Presupuestos', subtitle: 'Planificación por período y centro de costo, con ejecución trazable.' },
    servicios: { title: 'Servicios', subtitle: 'Catálogo de servicios y órdenes de trabajo con control de estados.' },
    activos: { title: 'Activos fijos', subtitle: 'Alta, depreciación lineal y baja de activos con auditoría.' },
    crm: { title: 'CRM', subtitle: 'Oportunidades, seguimientos y conversión a clientes reales.' }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={titulos[modulo].title}
        subtitle={titulos[modulo].subtitle}
        actions={
          <Button size="sm" variant="secondary" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </Button>
        }
      />

      {modulo === 'presupuestos' && (
        <Card title="Presupuestos" subtitle="Los importes se guardan en centavos; la ejecución se distribuye por líneas."
          actions={<Button size="sm" onClick={() => abrir('presupuesto')}><Plus size={14} /> Nuevo</Button>}>
          <DataTable columns={[
            ...columnasBase,
            { key: 'nombre', header: 'Nombre', value: (r) => txt(r, 'nombre') },
            { key: 'periodo', header: 'Período', value: (r) => txt(r, 'periodo') },
            { key: 'monto', header: 'Presupuestado', value: (r) => money(num(r, 'monto_cent')) },
            { key: 'ejecutado', header: 'Ejecutado', value: (r) => money(num(r, 'ejecutado_cent')) },
            { key: 'centro', header: 'Centro de costo', value: (r) => txt(r, 'centro_costo') }
          ]} data={filas} rowKey={(r) => num(r, 'id')} pageSize={10}
            actions={(r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" title={title('Ver detalle')} onClick={() => void verDetalle('presupuestos.detalle', num(r, 'id'), `Presupuesto ${txt(r, 'numero') || `#${num(r, 'id')}`}`)}><Eye size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => estado(r, 'presupuestos.estado', 'APROBADO')}>Aprobar</Button>
                <Button size="sm" variant="ghost" onClick={() => abrir('ejecutar', r)}>Ejecutar</Button>
                <Button size="sm" variant="ghost" onClick={() => estado(r, 'presupuestos.estado', 'ANULADO')}>Anular</Button>
              </div>
            )} />
        </Card>
      )}

      {modulo === 'servicios' && (
        <>
          <Tabs tabs={[{ id: 'listado', label: 'Órdenes' }, { id: 'catalogo', label: 'Catálogo de servicios' }]}
            active={subTab} onChange={setSubTab} />
          {subTab === 'listado' && (
            <Card title="Órdenes de servicio"
              actions={<Button size="sm" onClick={() => abrir('orden')}><Plus size={14} /> Nueva orden</Button>}>
              {catalogo.length === 0 && <p className="mb-3 text-xs text-amber-600">Cree primero servicios en el catálogo.</p>}
              <DataTable columns={[
                ...columnasBase,
                { key: 'cliente', header: 'Cliente', value: (r) => txt(r, 'cliente_nombre') },
                { key: 'prioridad', header: 'Prioridad', value: (r) => txt(r, 'prioridad') },
                { key: 'total', header: 'Total', value: (r) => money(num(r, 'total_cent')) },
                { key: 'fecha', header: 'Fecha', value: (r) => txt(r, 'fecha') }
              ]} data={filas} rowKey={(r) => num(r, 'id')}
                actions={(r) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" title={title('Ver detalle')} onClick={() => void verDetalle('servicios.orden.detalle', num(r, 'id'), `Orden ${txt(r, 'numero') || `#${num(r, 'id')}`}`)}><Eye size={14} /></Button>
                    {!esTerminal(r) && estadosConfigurados
                      .filter((valor) => valor !== txt(r, 'estado'))
                      .map((valor) => (
                        <Button key={valor} size="sm" variant="ghost"
                          onClick={() => estado(r, 'servicios.orden.estado', valor)}>
                          {etiquetasEstado[valor] ?? valor}
                        </Button>
                      ))}
                    {/* ANULADA no es configurable en flujos, pero la acción terminal existente se conserva. */}
                    {!esTerminal(r) && (
                      <Button size="sm" variant="ghost"
                        onClick={() => estado(r, 'servicios.orden.estado', 'ANULADA')}>Anular</Button>
                    )}
                    {txt(r, 'estado') === 'ENTREGADA' && (
                      <Badge tone="success">ENTREGADA</Badge>
                    )}
                  </div>
                )} />
            </Card>
          )}
          {subTab === 'catalogo' && (
            <Card title="Catálogo de servicios"
              actions={<Button size="sm" onClick={() => abrir('servicio')}><Plus size={14} /> Nuevo servicio</Button>}>
              <DataTable columns={[
                { key: 'codigo', header: 'Código', value: (r) => txt(r, 'codigo') },
                { key: 'nombre', header: 'Servicio', value: (r) => txt(r, 'nombre') },
                { key: 'precio', header: 'Precio', value: (r) => money(num(r, 'precio_cent')) },
                { key: 'duracion', header: 'Duración (min)', value: (r) => num(r, 'duracion_min') }
              ]} data={catalogo} rowKey={(r) => num(r, 'id')} />
            </Card>
          )}
        </>
      )}

      {modulo === 'activos' && (
        <Card title="Activos fijos" subtitle="La depreciación mensual se calcula de forma automática si no se indica monto."
          actions={<Button size="sm" onClick={() => abrir('activo')}><Plus size={14} /> Nuevo activo</Button>}>
          <DataTable columns={[
            ...columnasBase,
            { key: 'nombre', header: 'Activo', value: (r) => txt(r, 'nombre') },
            { key: 'categoria', header: 'Categoría', value: (r) => txt(r, 'categoria') },
            { key: 'adquisicion', header: 'Adquisición', value: (r) => money(num(r, 'valor_adquisicion_cent')) },
            { key: 'neto', header: 'Valor neto', value: (r) => money(num(r, 'valor_adquisicion_cent') - num(r, 'depreciacion_acumulada_cent')) },
            { key: 'ubicacion', header: 'Ubicación', value: (r) => txt(r, 'ubicacion') }
          ]} data={filas} rowKey={(r) => num(r, 'id')}
            actions={(r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" title={title('Ver detalle')} onClick={() => void verDetalle('activos.detalle', num(r, 'id'), `Activo ${txt(r, 'nombre')}`)}><Eye size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => abrir('depreciar', r)}>Depreciar</Button>
                <Button size="sm" variant="ghost" onClick={() => estado(r, 'activos.estado', 'BAJA')}>Dar de baja</Button>
              </div>
            )} />
        </Card>
      )}

      {modulo === 'crm' && (
        <Card title="Oportunidades" subtitle="La conversión crea un cliente real en el maestro de clientes."
          actions={<Button size="sm" onClick={() => abrir('lead')}><Plus size={14} /> Nueva oportunidad</Button>}>
          <DataTable columns={[
            ...columnasBase,
            { key: 'nombre', header: 'Contacto', value: (r) => txt(r, 'nombre') },
            { key: 'empresa', header: 'Empresa', value: (r) => txt(r, 'empresa') },
            { key: 'origen', header: 'Origen', value: (r) => txt(r, 'origen') },
            { key: 'probabilidad', header: 'Probabilidad', value: (r) => `${num(r, 'probabilidad')} %` },
            { key: 'valor', header: 'Valor estimado', value: (r) => money(num(r, 'valor_estimado_cent')) }
          ]} data={filas} rowKey={(r) => num(r, 'id')}
            actions={(r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => abrir('seguimiento', r)}>Seguimiento</Button>
                <Button size="sm" variant="ghost" onClick={() => estado(r, 'crm.lead.estado', 'CONTACTADO')}>Contactado</Button>
                {!num(r, 'cliente_id') && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    void action('crm.lead.convertir', { leadId: num(r, 'id') }, 'Oportunidad convertida en cliente.').then(cargar)
                  }}>Convertir</Button>
                )}
              </div>
            )} />
        </Card>
      )}

      <Modal
        open={modal !== ''}
        title={modal === 'ejecutar' ? 'Registrar ejecución' : modal === 'depreciar' ? 'Registrar depreciación' : modal === 'seguimiento' ? 'Nuevo seguimiento' : `Nuevo registro — ${titulos[modulo].title}`}
        onClose={() => setModal('')}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal('')}>Cancelar</Button><Button onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button></div>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {modal === 'presupuesto' && (
            <>
              <Campo label="Nombre" value={f('nombre')} onChange={(v) => setf('nombre', v)} />
              <Campo label="Período (AAAA-MM)" value={f('periodo')} onChange={(v) => setf('periodo', v)} placeholder="2027-01" />
              <Campo label="Centro de costo" value={f('centroCosto')} onChange={(v) => setf('centroCosto', v)} />
              <Campo label="Categoría" value={f('categoria')} onChange={(v) => setf('categoria', v)} />
              <Campo label="Descripción" value={f('descripcion')} onChange={(v) => setf('descripcion', v)} />
              <Campo label="Monto (RD$)" type="number" value={f('montoCent')} onChange={(v) => setf('montoCent', v)} />
              <Campo label="Observaciones" value={f('observaciones')} onChange={(v) => setf('observaciones', v)} />
            </>
          )}
          {modal === 'ejecutar' && (
            <>
              <Campo label="Monto (RD$)" type="number" value={f('montoCent')} onChange={(v) => setf('montoCent', v)} />
              <Campo label="Descripción" value={f('descripcion')} onChange={(v) => setf('descripcion', v)} />
            </>
          )}
          {modal === 'servicio' && (
            <>
              <Campo label="Código" value={f('codigo')} onChange={(v) => setf('codigo', v)} />
              <Campo label="Nombre" value={f('nombre')} onChange={(v) => setf('nombre', v)} />
              <Campo label="Precio (RD$)" type="number" value={f('precioCent')} onChange={(v) => setf('precioCent', v)} />
              <Campo label="Duración (min)" type="number" value={f('duracionMin')} onChange={(v) => setf('duracionMin', v)} />
              <Campo label="Descripción" value={f('descripcion')} onChange={(v) => setf('descripcion', v)} />
            </>
          )}
          {modal === 'orden' && (
            <>
              <SelectCampo label="Cliente" value={f('clienteId')}
                options={[{ value: '', label: 'Seleccione…' }, ...clientes.map((c) => ({ value: String(num(c, 'id')), label: txt(c, 'nombre') }))]}
                onChange={(v) => setf('clienteId', v)} />
              <SelectCampo label="Servicio" value={f('servicioId')}
                options={[{ value: '', label: 'Seleccione…' }, ...catalogo.map((c) => ({ value: String(num(c, 'id')), label: txt(c, 'nombre') }))]}
                onChange={(v) => setf('servicioId', v)} />
              <Campo label="Cantidad" type="number" value={f('cantidad')} onChange={(v) => setf('cantidad', v)} />
              <Campo label="Fecha compromiso" type="date" value={f('fechaCompromiso')} onChange={(v) => setf('fechaCompromiso', v)} />
              <SelectCampo label="Prioridad" value={f('prioridad')}
                options={['BAJA', 'NORMAL', 'ALTA', 'URGENTE'].map((v) => ({ value: v, label: v }))}
                onChange={(v) => setf('prioridad', v)} />
              <Campo label="ITBIS (bp)" type="number" value={f('tasaBp')} onChange={(v) => setf('tasaBp', v)} />
              <Campo label="Diagnóstico" value={f('diagnostico')} onChange={(v) => setf('diagnostico', v)} />
              <Campo label="Observaciones" value={f('observaciones')} onChange={(v) => setf('observaciones', v)} />
            </>
          )}
          {modal === 'activo' && (
            <>
              <Campo label="Nombre" value={f('nombre')} onChange={(v) => setf('nombre', v)} />
              <SelectCampo label="Categoría" value={f('categoria')}
                options={['EQUIPO', 'MOBILIARIO', 'VEHICULO', 'INMUEBLE', 'SOFTWARE', 'OTRO'].map((v) => ({ value: v, label: v }))}
                onChange={(v) => setf('categoria', v)} />
              <Campo label="Código interno" value={f('codigoInterno')} onChange={(v) => setf('codigoInterno', v)} />
              <Campo label="Ubicación" value={f('ubicacion')} onChange={(v) => setf('ubicacion', v)} />
              <Campo label="Fecha de compra" type="date" value={f('fechaCompra')} onChange={(v) => setf('fechaCompra', v)} />
              <Campo label="Valor de adquisición (RD$)" type="number" value={f('valorAdquisicionCent')} onChange={(v) => setf('valorAdquisicionCent', v)} />
              <Campo label="Valor residual (RD$)" type="number" value={f('valorResidualCent')} onChange={(v) => setf('valorResidualCent', v)} />
              <Campo label="Vida útil (meses)" type="number" value={f('vidaUtilMeses')} onChange={(v) => setf('vidaUtilMeses', v)} />
              <Campo label="Observaciones" value={f('observaciones')} onChange={(v) => setf('observaciones', v)} />
            </>
          )}
          {modal === 'depreciar' && (
            <>
              <Campo label="Período (AAAA-MM)" value={f('periodo')} onChange={(v) => setf('periodo', v)} />
              <Campo label="Monto (RD$, opcional)" type="number" value={f('montoCent')} onChange={(v) => setf('montoCent', v)} />
            </>
          )}
          {modal === 'lead' && (
            <>
              <Campo label="Contacto" value={f('nombre')} onChange={(v) => setf('nombre', v)} />
              <Campo label="Empresa" value={f('empresa')} onChange={(v) => setf('empresa', v)} />
              <Campo label="RNC/cédula" value={f('rncCedula')} onChange={(v) => setf('rncCedula', v)} />
              <Campo label="Teléfono" value={f('telefono')} onChange={(v) => setf('telefono', v)} />
              <Campo label="Correo" type="email" value={f('email')} onChange={(v) => setf('email', v)} />
              <SelectCampo label="Origen" value={f('origen')}
                options={['WEB', 'REFERIDO', 'LLAMADA', 'REDES', 'EVENTO', 'OTRO'].map((v) => ({ value: v, label: v }))}
                onChange={(v) => setf('origen', v)} />
              <Campo label="Probabilidad (%)" type="number" value={f('probabilidad')} onChange={(v) => setf('probabilidad', v)} />
              <Campo label="Valor estimado (RD$)" type="number" value={f('valorEstimadoCent')} onChange={(v) => setf('valorEstimadoCent', v)} />
              <Campo label="Próximo seguimiento" type="date" value={f('proximoSeguimiento')} onChange={(v) => setf('proximoSeguimiento', v)} />
              <Campo label="Observaciones" value={f('observaciones')} onChange={(v) => setf('observaciones', v)} />
            </>
          )}
          {modal === 'seguimiento' && (
            <>
              <SelectCampo label="Tipo" value={f('tipo')}
                options={['LLAMADA', 'EMAIL', 'VISITA', 'MENSAJE', 'OTRO'].map((v) => ({ value: v, label: v }))}
                onChange={(v) => setf('tipo', v)} />
              <Campo label="Próximo seguimiento" type="date" value={f('proximoSeguimiento')} onChange={(v) => setf('proximoSeguimiento', v)} />
              <Campo label="Descripción" value={f('descripcion')} onChange={(v) => setf('descripcion', v)} />
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!detalle}
        title={`Detalle — ${detalle?.titulo ?? ''}`}
        onClose={() => setDetalle(null)}
        width="max-w-3xl"
        footer={<Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        {detalle && (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            {Object.entries(detalle.datos as Record<string, unknown> ?? {}).map(([clave, valor]) => (
              <div key={clave} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-1 text-xs uppercase text-slate-500">{clave.replace(/_/g, ' ')}</p>
                {Array.isArray(valor) ? (
                  valor.length
                    ? <pre className="overflow-x-auto text-xs">{JSON.stringify(valor, null, 2)}</pre>
                    : <p className="text-slate-400">Sin registros.</p>
                ) : (
                  <p className="break-words">{typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : String(valor ?? '—')}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Save, Building2, CheckCircle2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, TextInput } from '@/components/ui/Field'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { toast } from '@/components/ui/Toast'
import { errorInfo } from '@/app/session'
import { CatalogManager, toForm } from './CatalogManager'
import type { ConfigData, ConfigRow } from './types'

/** Convierte la fila fiscal de SQLite al contrato camelCase usado por Zod. */
function empresaToForm(row: ConfigRow): Record<string, unknown> {
  const f = toForm(row)
  return {
    id: f.id,
    nombreComercial: f.nombreComercial ?? '',
    razonSocial: f.razonSocial ?? '',
    rnc: f.rnc ?? '',
    cedula: f.cedula ?? '',
    direccion: f.direccion ?? '',
    telefonos: f.telefonos ?? '',
    email: f.email ?? '',
    logoPath: f.logoPath ?? null,
    monedaBase: f.monedaBase ?? 'DOP',
    activa: Boolean(f.activa ?? 1)
  }
}

function EmpresaTab({ cfg, reload }: { cfg: ConfigData; reload: () => void }): React.JSX.Element {
  const [form, setForm] = useState<Record<string, unknown>>(() => empresaToForm(cfg.empresa ?? {}))
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setForm(empresaToForm(cfg.empresa ?? {})); setCreating(false) }, [cfg.empresa])

  async function save(): Promise<void> {
    setSaving(true)
    try {
      await window.api.invoke('config.empresa.save', creating ? form : { ...form, id: cfg.empresa.id })
      toast.success(creating ? 'Empresa creada con su configuración inicial.' : 'Datos de empresa guardados.')
      reload()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setSaving(false) }
  }

  function startNew(): void {
    setCreating(true)
    setForm({ nombreComercial: '', razonSocial: '', rnc: '', cedula: '', direccion: '', telefonos: '', email: '', monedaBase: 'DOP', activa: true })
  }

  const f = (key: string, label: string, extra?: { type?: string; hint?: string }): React.JSX.Element => (
    <Field key={key} label={label} hint={extra?.hint}>
      <TextInput type={extra?.type ?? 'text'} value={String(form[key] ?? '')} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  )

  return (
    <div className="space-y-4">
      <Card
        title="Datos de la empresa"
        subtitle="Información comercial y fiscal utilizada en documentos y reportes."
        actions={<div className="flex gap-2"><Button variant="secondary" onClick={startNew}><Plus size={14} /> Nueva empresa</Button><Button onClick={() => void save()} disabled={saving}><Save size={14} /> Guardar</Button></div>}
      >
        {creating && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Creando una empresa nueva: se generarán sus parámetros, series, almacén, caja y roles propios.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {f('nombreComercial', 'Nombre comercial')}
          {f('razonSocial', 'Razón social')}
          {f('rnc', 'RNC (9 u 11 dígitos)', { hint: 'Datos fiscales de República Dominicana' })}
          {f('cedula', 'Cédula')}
          {f('direccion', 'Dirección')}
          {f('telefonos', 'Teléfonos')}
          {f('email', 'Correo electrónico', { type: 'email' })}
          {f('monedaBase', 'Moneda base', { hint: 'Código ISO, por ejemplo DOP' })}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          {cfg.empresa.configurada
            ? <><CheckCircle2 size={14} className="text-emerald-500" /> Empresa configurada</>
            : <Badge tone="warning">Complete los datos fiscales para configurar la empresa</Badge>}
        </div>
      </Card>
      <Card title="Empresas registradas" subtitle="Cada empresa mantiene sus propios registros aislados.">
        <ul className="space-y-2 text-sm">
          {cfg.empresas.map((e) => (
            <li key={String(e.id)} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="flex items-center gap-2"><Building2 size={15} className="text-indigo-500" /> {String(e.nombre_comercial)}</span>
              <span className="flex items-center gap-2 text-xs text-slate-400">
                {String(e.rnc || 'Sin RNC')}
                {Number(e.id) === cfg.empresa.id && <Badge tone="accent">Activa</Badge>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          Para trabajar en otra empresa, cierre la sesión y selecciónela al iniciar sesión (si su usuario tiene acceso).
        </p>
      </Card>
    </div>
  )
}

function SeriesTab({ cfg, reload }: { cfg: ConfigData; reload: () => void }): React.JSX.Element {
  const [edit, setEdit] = useState<ConfigRow | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!edit) return
    setSaving(true)
    try {
      await window.api.invoke('config.catalog.save', { tabla: 'series_documento', data: edit })
      toast.success('Serie guardada.')
      setEdit(null); reload()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setSaving(false) }
  }

  const rows = cfg.series.map(toForm)
  const columns: Column<ConfigRow>[] = [
    { key: 'tipoDoc', header: 'Documento', value: (r) => String(r.tipoDoc) },
    { key: 'prefijo', header: 'Prefijo', value: (r) => String(r.prefijo) },
    { key: 'siguiente', header: 'Siguiente', value: (r) => Number(r.siguiente) },
    { key: 'esNcf', header: 'NCF', render: (r) => r.esNcf ? <Badge tone="accent">Sí</Badge> : <Badge>No</Badge> },
    { key: 'activa', header: 'Activa', render: (r) => r.activa ? <Badge tone="success">Sí</Badge> : <Badge tone="danger">No</Badge> }
  ]

  return (
    <div className="space-y-4">
      <Card title="Numeración de documentos y NCF" subtitle="Secuencias internas y rangos fiscales configurables por empresa.">
        <DataTable columns={columns} data={rows} rowKey={(r) => Number(r.id)} pageSize={10} actions={(r) => (
          <Button size="sm" variant="secondary" onClick={() => setEdit({ ...r })}>Editar</Button>
        )} />
      </Card>
      <Modal open={!!edit} title="Editar serie" onClose={() => setEdit(null)} footer={
        <><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>Guardar</Button></>
      }>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['serie', 'Serie'], ['prefijo', 'Prefijo'], ['siguiente', 'Siguiente número'],
              ['longitud', 'Longitud'], ['rangoDesde', 'Rango NCF desde'], ['rangoHasta', 'Rango NCF hasta'],
              ['venceEn', 'Vigencia (YYYY-MM-DD)'], ['alertaMin', 'Alerta mínima']
            ] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <TextInput
                  type={['siguiente', 'longitud', 'alertaMin'].includes(k) ? 'number' : 'text'}
                  value={String(edit[k] ?? '')}
                  onChange={(e) => setEdit({ ...edit, [k]: ['siguiente', 'longitud', 'alertaMin'].includes(k) ? Number(e.target.value) : e.target.value })}
                />
              </Field>
            ))}
            {(['esNcf', 'activa'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(edit[k])} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} />
                {k === 'esNcf' ? 'Es comprobante fiscal (NCF)' : 'Serie activa'}
              </label>
            ))}
          </div>
        )}
      </Modal>
      <p className="text-xs text-slate-400">
        ADVERTENCIA: modificar "Siguiente número" puede generar duplicados. Solo utilícese para corregir series nunca emitidas.
      </p>
    </div>
  )
}

function CatalogosTab({ cfg, reload }: { cfg: ConfigData; reload: () => void }): React.JSX.Element {
  const [tasa, setTasa] = useState({ monedaCodigo: 'USD', tasa: 0, fecha: new Date().toISOString().slice(0, 10) })
  const [formato, setFormato] = useState({ tipoDoc: 'FACTURA_CONTADO', formato: 'CARTA', copias: 1 })

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <CatalogManager tabla="impuestos" title="Impuestos (ITBIS)" rows={cfg.impuestos} onSaved={reload} fields={[
        { key: 'codigo', label: 'Código', default: '' },
        { key: 'descripcion', label: 'Descripción', default: '' },
        { key: 'tasaBp', label: 'Tasa (puntos base)', type: 'number', default: 1800 },
        { key: 'exento', label: 'Exento', type: 'checkbox', default: false },
        { key: 'activo', label: 'Activo', type: 'checkbox', default: true }
      ]} />
      <CatalogManager tabla="monedas" title="Monedas" rows={cfg.monedas} onSaved={reload} fields={[
        { key: 'codigo', label: 'Código ISO', default: '' },
        { key: 'nombre', label: 'Nombre', default: '' },
        { key: 'simbolo', label: 'Símbolo', default: '' },
        { key: 'decimales', label: 'Decimales', type: 'number', default: 2 },
        { key: 'activa', label: 'Activa', type: 'checkbox', default: true }
      ]} />
      <Card title="Tasas de cambio" subtitle="Registro histórico de tasas por moneda y fecha.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Moneda"><TextInput value={tasa.monedaCodigo} onChange={(e) => setTasa({ ...tasa, monedaCodigo: e.target.value.toUpperCase() })} /></Field>
          <Field label="Tasa"><TextInput type="number" value={tasa.tasa} onChange={(e) => setTasa({ ...tasa, tasa: Number(e.target.value) })} /></Field>
          <Field label="Fecha"><TextInput type="date" value={tasa.fecha} onChange={(e) => setTasa({ ...tasa, fecha: e.target.value })} /></Field>
        </div>
        <Button className="mt-3" size="sm" onClick={() => void (async () => {
          try { await window.api.invoke('config.tasa.save', tasa); toast.success('Tasa guardada.'); reload() }
          catch (e) { toast.error(errorInfo(e).message) }
        })()}>Guardar tasa</Button>
        <div className="mt-3 text-xs text-slate-500">
          {cfg.tasas.length ? cfg.tasas.map((t, i) => (
            <div key={i} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
              <span>{String(t.moneda_codigo)} · {String(t.fecha)}</span><span>{String(t.tasa)}</span>
            </div>
          )) : 'Sin tasas registradas además de la moneda base.'}
        </div>
      </Card>
      <CatalogManager tabla="almacenes" title="Almacenes" rows={cfg.almacenes} onSaved={reload} fields={[
        { key: 'codigo', label: 'Código', default: '' },
        { key: 'nombre', label: 'Nombre', default: '' },
        { key: 'direccion', label: 'Dirección', default: '' },
        { key: 'principal', label: 'Principal', type: 'checkbox', default: false },
        { key: 'activo', label: 'Activo', type: 'checkbox', default: true }
      ]} />
      <CatalogManager tabla="cajas" title="Cajas" rows={cfg.cajas} onSaved={reload} fields={[
        { key: 'codigo', label: 'Código', default: '' },
        { key: 'nombre', label: 'Nombre', default: '' },
        { key: 'impresoraTicket', label: 'Impresora ticket', default: '' },
        { key: 'activa', label: 'Activa', type: 'checkbox', default: true }
      ]} />
      <Card title="Formatos de impresión" subtitle="Formato predeterminado por tipo de documento.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Documento">
            <select className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={formato.tipoDoc} onChange={(e) => setFormato({ ...formato, tipoDoc: e.target.value })}>
              {cfg.series.map((s) => <option key={String(s.id)} value={String(s.tipo_doc)}>{String(s.tipo_doc)}</option>)}
            </select>
          </Field>
          <Field label="Formato">
            <select className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={formato.formato} onChange={(e) => setFormato({ ...formato, formato: e.target.value })}>
              {['CARTA', 'MEDIA_PAGINA', 'TICKET_80', 'TICKET_58'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Copias"><TextInput type="number" value={formato.copias} onChange={(e) => setFormato({ ...formato, copias: Number(e.target.value) })} /></Field>
        </div>
        <Button className="mt-3" size="sm" onClick={() => void (async () => {
          try { await window.api.invoke('config.formato.save', formato); toast.success('Formato guardado.'); reload() }
          catch (e) { toast.error(errorInfo(e).message) }
        })()}>Guardar formato</Button>
        <p className="mt-3 text-xs text-slate-400">
          {cfg.formatos.length} formato(s) configurado(s). La impresión física se implementa en la Fase 6.
        </p>
      </Card>
      <CatalogManager tabla="impresoras" title="Impresoras configuradas" rows={cfg.impresoras} onSaved={reload} fields={[
        { key: 'nombre', label: 'Nombre', default: '' },
        { key: 'puerto', label: 'Puerto', default: '' },
        { key: 'tipo', label: 'Tipo (CARTA/TICKET_80/TICKET_58)', default: 'CARTA' },
        { key: 'predeterminada', label: 'Predeterminada', type: 'checkbox', default: false }
      ]} />
    </div>
  )
}

function ParametrosTab({ cfg, reload }: { cfg: ConfigData; reload: () => void }): React.JSX.Element {
  const [params, setParams] = useState<Record<string, string>>(cfg.parametros)
  const [backup, setBackup] = useState({ carpeta: cfg.parametros.backup_carpeta ?? '', frecuencia: cfg.parametros.backup_frecuencia ?? 'DIARIO', hora: cfg.parametros.backup_hora ?? '02:00', retencionDias: Number(cfg.parametros.backup_retencion_dias ?? 30) })

  useEffect(() => setParams(cfg.parametros), [cfg.parametros])

  async function saveParams(): Promise<void> {
    try {
      for (const [clave, valor] of Object.entries(params)) {
        if (clave.startsWith('backup_')) continue
        await window.api.invoke('config.parametro.set', { clave, valor })
      }
      toast.success('Parámetros guardados.'); reload()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function saveBackup(): Promise<void> {
    try {
      await window.api.invoke('config.backup.config', backup)
      toast.success('Configuración de respaldos guardada. El programador la aplica en el próximo ciclo.'); reload()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Parámetros generales" actions={<Button size="sm" onClick={() => void saveParams()}><Save size={14} /> Guardar</Button>}>
        <div className="space-y-3">
          {Object.entries(params).filter(([k]) => !k.startsWith('backup_')).map(([k, v]) => (
            <Field key={k} label={k.replaceAll('_', ' ')}>
              <TextInput value={v} onChange={(e) => setParams({ ...params, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Card>
      <Card title="Respaldos" subtitle="La ejecución, el historial y la restauración están en el módulo Respaldos.">
        <div className="space-y-3">
          <Field label="Carpeta de respaldo"><TextInput value={backup.carpeta} placeholder="Ruta local absoluta" onChange={(e) => setBackup({ ...backup, carpeta: e.target.value })} /></Field>
          <Field label="Frecuencia">
            <select className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={backup.frecuencia} onChange={(e) => setBackup({ ...backup, frecuencia: e.target.value })}>
              {['DESACTIVADO', 'DIARIO', 'SEMANAL', 'MENSUAL'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora"><TextInput type="time" value={backup.hora} onChange={(e) => setBackup({ ...backup, hora: e.target.value })} /></Field>
            <Field label="Retención (días)"><TextInput type="number" value={backup.retencionDias} onChange={(e) => setBackup({ ...backup, retencionDias: Number(e.target.value) })} /></Field>
          </div>
          <Button size="sm" onClick={() => void saveBackup()}>Guardar configuración de respaldos</Button>
        </div>
      </Card>
    </div>
  )
}

export function ConfiguracionPage(): React.JSX.Element {
  const [cfg, setCfg] = useState<ConfigData | null>(null)
  const [tab, setTab] = useState('empresa')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setCfg(await window.api.invoke<ConfigData>('config.get')) }
    catch (e) { toast.error(errorInfo(e).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading || !cfg) return <p className="text-sm text-slate-400">Cargando configuración…</p>

  return (
    <div className="animate-fade-in">
      <PageHeader title="Configuración general" subtitle="Empresa, impuestos, numeración, almacenes, cajas y parámetros del sistema." />
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'empresa', label: 'Empresa' },
        { id: 'catalogos', label: 'Impuestos, monedas y almacenes' },
        { id: 'series', label: 'Series y NCF' },
        { id: 'parametros', label: 'Parámetros y respaldos' }
      ]} />
      <TabPanel>
        {tab === 'empresa' && <EmpresaTab cfg={cfg} reload={() => void load()} />}
        {tab === 'catalogos' && <CatalogosTab cfg={cfg} reload={() => void load()} />}
        {tab === 'series' && <SeriesTab cfg={cfg} reload={() => void load()} />}
        {tab === 'parametros' && <ParametrosTab cfg={cfg} reload={() => void load()} />}
      </TabPanel>
    </div>
  )
}

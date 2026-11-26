import { useCallback, useEffect, useState } from 'react'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo, useSessionStore } from '@/app/session'

interface AuditRow {
  id: number
  fecha: string
  username: string | null
  operacion: string
  entidad: string
  entidad_id: string | null
  valores_antes: string | null
  valores_despues: string | null
}

interface SessionRow {
  id: number
  username: string
  nombre: string
  inicio: string
  ultima_actividad: string
  fin: string | null
  equipo: string
}

const toneFor = (op: string): 'success' | 'warning' | 'danger' | 'accent' | 'neutral' => {
  if (op.includes('CREAR') || op === 'LOGIN') return 'success'
  if (op.includes('MODIFICAR')) return 'accent'
  if (op.includes('ELIMINAR') || op.includes('ANULAR')) return 'danger'
  if (op.includes('BLOQUEAR') || op.includes('RESTABLECER')) return 'warning'
  return 'neutral'
}

export function AuditoriaPage(): React.JSX.Element {
  const [tab, setTab] = useState('auditoria')
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [filter, setFilter] = useState({
    fechaDesde: '', fechaHasta: '', operacion: '', entidad: '', entidadId: '', texto: ''
  })
  const [detalle, setDetalle] = useState<AuditRow | null>(null)
  const ctxSesionId = useSessionStore((s) => s.ctx?.sesionId)

  const loadAudit = useCallback(async () => {
    try {
      const f = Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) as typeof filter
      setAudit(await window.api.invoke<AuditRow[]>('seguridad.audit.list', f))
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [filter])

  useEffect(() => { void loadAudit() }, [loadAudit])

  useEffect(() => {
    if (tab === 'sesiones') {
      void window.api.invoke<SessionRow[]>('seguridad.sessions.list')
        .then(setSessions)
        .catch((e) => toast.error(errorInfo(e).message))
    }
  }, [tab])

  async function cerrarSesion(id: number): Promise<void> {
    try {
      await window.api.invoke('seguridad.sessions.close', id)
      toast.success('Sesión cerrada y auditada.')
      setSessions(await window.api.invoke<SessionRow[]>('seguridad.sessions.list'))
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const auditColumns: Column<AuditRow>[] = [
    { key: 'fecha', header: 'Fecha', value: (r) => String(r.fecha) },
    { key: 'usuario', header: 'Usuario', value: (r) => r.username ?? '—' },
    { key: 'operacion', header: 'Operación', render: (r) => <Badge tone={toneFor(r.operacion)}>{r.operacion}</Badge> },
    { key: 'entidad', header: 'Entidad', value: (r) => String(r.entidad) },
    { key: 'id', header: 'Registro', value: (r) => r.entidad_id ?? '—' }
  ]

  const sessionColumns: Column<SessionRow>[] = [
    { key: 'username', header: 'Usuario', value: (r) => r.username },
    { key: 'nombre', header: 'Nombre', value: (r) => r.nombre },
    { key: 'inicio', header: 'Inicio', value: (r) => String(r.inicio) },
    { key: 'actividad', header: 'Última actividad', value: (r) => String(r.ultima_actividad) },
    { key: 'fin', header: 'Estado', render: (r) => r.fin ? <Badge>Cerrada</Badge> : <Badge tone="success">Abierta</Badge> },
    { key: 'equipo', header: 'Equipo', value: (r) => r.equipo }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader title="Auditoría y control" subtitle="Registro de operaciones críticas y sesiones del sistema." />
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'auditoria', label: 'Historial de operaciones' },
        { id: 'sesiones', label: 'Sesiones' }
      ]} />
      <TabPanel>
        {tab === 'auditoria' && (
          <div className="space-y-3">
            <Card>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Desde"><TextInput type="date" value={filter.fechaDesde} onChange={(e) => setFilter({ ...filter, fechaDesde: e.target.value })} /></Field>
                <Field label="Hasta"><TextInput type="date" value={filter.fechaHasta} onChange={(e) => setFilter({ ...filter, fechaHasta: e.target.value })} /></Field>
                <Field label="Operación"><TextInput value={filter.operacion} placeholder="Ej. MODIFICAR" onChange={(e) => setFilter({ ...filter, operacion: e.target.value })} /></Field>
                <Field label="Entidad"><TextInput value={filter.entidad} placeholder="Ej. usuarios" onChange={(e) => setFilter({ ...filter, entidad: e.target.value })} /></Field>
                <Field label="ID del registro" hint="Historial por registro"><TextInput value={filter.entidadId} placeholder="Ej. 42" onChange={(e) => setFilter({ ...filter, entidadId: e.target.value })} /></Field>
                <Field label="Buscar en valores" hint="Incluye antes y después"><TextInput value={filter.texto} placeholder="Ej. cliente, RNC…" onChange={(e) => setFilter({ ...filter, texto: e.target.value })} /></Field>
              </div>
            </Card>
            <Card>
              <DataTable columns={auditColumns} data={audit} rowKey={(r) => r.id} pageSize={12}
                actions={(r) => <button onClick={() => setDetalle(r)} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">Ver detalle</button>} />
            </Card>
          </div>
        )}
        {tab === 'sesiones' && (
          <Card>
            <DataTable
              columns={sessionColumns}
              data={sessions}
              rowKey={(r) => r.id}
              pageSize={12}
              actions={(r) => can('seguridad.usuario.bloquear') && !r.fin && r.id !== ctxSesionId ? (
                <button
                  onClick={() => void cerrarSesion(r.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                  title="Cerrar esta sesión"
                >Cerrar</button>
              ) : null}
            />
          </Card>
        )}
      </TabPanel>

      {detalle && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setDetalle(null)}>
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold">Detalle de auditoría #{detalle.id}</h3>
            <div className="grid gap-3 text-xs">
              <div><p className="font-medium text-slate-500">Antes</p><pre className="max-h-40 overflow-auto rounded bg-slate-100 p-2 dark:bg-slate-800">{detalle.valores_antes ?? '—'}</pre></div>
              <div><p className="font-medium text-slate-500">Después</p><pre className="max-h-40 overflow-auto rounded bg-slate-100 p-2 dark:bg-slate-800">{detalle.valores_despues ?? '—'}</pre></div>
            </div>
            <div className="mt-4 text-right"><button onClick={() => setDetalle(null)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white">Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo, useSessionStore } from '@/app/session'
import { moduleLabels, type PermissionDef } from '@shared/permissions'

interface RoleRow { id: number; nombre: string; descripcion: string; total_permisos: number }
type PermDef = PermissionDef
interface RoleDetail { id: number; nombre: string; descripcion: string; permisos: string[] }

export function RolesPage(): React.JSX.Element {
  const refreshSession = useSessionStore((s) => s.refresh)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [catalog, setCatalog] = useState<PermDef[]>([])
  const [editing, setEditing] = useState<RoleDetail | null>(null)
  const [filtroPermisos, setFiltroPermisos] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        window.api.invoke<RoleRow[]>('seguridad.roles.list'),
        window.api.invoke<PermDef[]>('seguridad.permissions.catalog')
      ])
      setRoles(r); setCatalog(p)
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function openEditor(id?: number): Promise<void> {
    if (!id) {
      setEditing({ id: 0, nombre: '', descripcion: '', permisos: [] })
      return
    }
    try {
      setEditing(await window.api.invoke<RoleDetail>('seguridad.roles.get', id))
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function save(): Promise<void> {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.id) {
        await window.api.invoke('seguridad.roles.update', editing)
        toast.success('Rol y permisos actualizados.')
      } else {
        await window.api.invoke('seguridad.roles.create', editing)
        toast.success('Rol creado.')
      }
      setEditing(null)
      await load()
      await refreshSession()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setSaving(false) }
  }

  const grouped = useMemo(() => {
    const q = filtroPermisos.trim().toLowerCase()
    const map = new Map<string, PermDef[]>()
    for (const p of catalog) {
      if (q && !`${p.label} ${p.descripcion} ${p.key}`.toLowerCase().includes(q)) continue
      map.set(p.module, [...(map.get(p.module) ?? []), p])
    }
    return [...map.entries()]
  }, [catalog, filtroPermisos])

  const locked = editing?.nombre === 'Administrador'

  const columns: Column<RoleRow>[] = [
    { key: 'nombre', header: 'Rol', value: (r) => r.nombre },
    { key: 'descripcion', header: 'Descripción', value: (r) => r.descripcion },
    { key: 'permisos', header: 'Permisos', value: (r) => r.total_permisos },
    {
      key: 'sistema', header: 'Tipo',
      render: (r) => r.nombre === 'Administrador'
        ? <Badge tone="accent"><ShieldCheck size={11} /> Sistema</Badge>
        : <Badge>Personalizado</Badge>
    }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Roles y permisos"
        subtitle="Los permisos se verifican también en el backend antes de cada operación."
        actions={<Button onClick={() => void openEditor()}><Plus size={15} /> Nuevo rol</Button>}
      />
      <Card>
        <DataTable
          columns={columns}
          data={roles}
          rowKey={(r) => r.id}
          searchPlaceholder="Buscar rol…"
          actions={(r) => (
            <button onClick={() => void openEditor(r.id)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar permisos">
              <Pencil size={15} />
            </button>
          )}
        />
      </Card>

      <Modal
        open={!!editing}
        title={editing?.id ? `Editar rol: ${editing.nombre}` : 'Nuevo rol'}
        onClose={() => setEditing(null)}
        width="max-w-4xl"
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
          {!locked && <Button onClick={() => void save()} disabled={saving || !can('seguridad.permiso.modificar')}>{saving ? 'Guardando…' : 'Guardar permisos'}</Button>}
        </>}
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del rol">
                <TextInput value={editing.nombre} disabled={locked || !!editing.id} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} />
              </Field>
              <Field label="Descripción">
                <TextInput value={editing.descripcion} disabled={locked} onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })} />
              </Field>
            </div>
            {locked && (
              <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                El rol Administrador posee todos los permisos del sistema y no puede modificarse.
              </p>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <TextInput
                className="pl-8"
                value={filtroPermisos}
                onChange={(e) => setFiltroPermisos(e.target.value)}
                placeholder="Buscar por nombre, clave o descripción…"
                aria-label="Buscar permisos"
              />
            </div>
            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
                  <tr><th className="px-3 py-2 text-left">Módulo</th><th className="px-3 py-2 text-left">Permisos (para qué sirven)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {grouped.map(([modulo, perms]) => (
                    <tr key={modulo}>
                      <td className="px-3 py-2 align-top font-medium">{moduleLabels[modulo as keyof typeof moduleLabels] ?? modulo}</td>
                      <td className="px-3 py-2">
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          {perms.map((p) => (
                            <label key={p.key} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                disabled={locked || !can('seguridad.permiso.modificar')}
                                checked={editing.permisos.includes(p.key)}
                                onChange={(e) => setEditing({
                                  ...editing,
                                  permisos: e.target.checked
                                    ? [...editing.permisos, p.key]
                                    : editing.permisos.filter((k) => k !== p.key)
                                })}
                              />
                              <span>
                                <span className="font-medium">{p.label}</span>
                                {p.critico && <span className="ml-1 rounded bg-red-100 px-1 text-[9px] text-red-700 dark:bg-red-950/50 dark:text-red-300">crítico</span>}
                                <span className="block text-[10px] text-slate-400">{p.descripcion}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">Total seleccionado: {editing.permisos.length} permisos</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Pencil, LockKeyhole, Ban, RotateCcw, UserPlus, Check, X, Power } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { errorInfo, useSessionStore } from '@/app/session'
import type { UserRow, RoleRow, DepartmentRow } from './types'

interface FormState {
  id?: number
  username: string
  nombre: string
  email: string
  departamentoId: number | null
  roles: { rolId: number; empresaId: number }[]
  activo: boolean
}

const emptyForm: FormState = { username: '', nombre: '', email: '', departamentoId: null, roles: [], activo: true }

export function UsuariosPage(): React.JSX.Element {
  const ctx = useSessionStore((s) => s.ctx)
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [resetFor, setResetFor] = useState<UserRow | null>(null)
  const [tempPassword, setTempPassword] = useState('')
  const [statusFor, setStatusFor] = useState<{ user: UserRow; field: 'activo' | 'bloqueado'; value: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const [u, r, d] = await Promise.all([
        window.api.invoke<UserRow[]>('seguridad.users.list'),
        window.api.invoke<RoleRow[]>('seguridad.roles.list'),
        window.api.invoke<DepartmentRow[]>('seguridad.departments.list')
      ])
      setUsers(u); setRoles(r); setDepartments(d)
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [])

  useEffect(() => { void load() }, [load])

  function openNew(): void {
    const defaultRoles = roles.length ? [{ rolId: roles[0].id, empresaId: ctx?.empresaId ?? 1 }] : []
    setForm({ ...emptyForm, roles: defaultRoles })
  }

  function openEdit(u: UserRow): void {
    setForm({
      id: u.id, username: u.username, nombre: u.nombre, email: u.email,
      departamentoId: departments.find((d) => d.nombre === u.departamento)?.id ?? null,
      roles: [], activo: Boolean(u.activo)
    })
    // Los roles asignados se leen de la BD para no perderlos al guardar.
    void window.api.invoke<{ roles: { rolId: number; empresaId: number }[] }>('seguridad.users.get', u.id)
      .then((detail) => setForm((f) => (f?.id === u.id ? { ...f, roles: detail.roles } : f)))
      .catch((e) => toast.error(errorInfo(e).message))
  }

  async function save(): Promise<void> {
    if (!form) return
    setLoading(true)
    try {
      if (form.id) {
        await window.api.invoke('seguridad.users.update', { ...form, id: form.id })
        toast.success('Usuario actualizado.')
      } else {
        const res = await window.api.invoke<{ contrasenaInicial: string }>('seguridad.users.create', form)
        toast.success(`Usuario creado. Contraseña inicial: ${res.contrasenaInicial}`)
      }
      setForm(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setLoading(false) }
  }

  async function changeStatus(): Promise<void> {
    if (!statusFor) return
    try {
      await window.api.invoke('seguridad.users.status', {
        userId: statusFor.user.id, field: statusFor.field, value: statusFor.value
      })
      toast.success('Estado del usuario actualizado.')
      setStatusFor(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function doReset(): Promise<void> {
    if (!resetFor) return
    try {
      const res = await window.api.invoke<unknown>('auth.resetPassword', resetFor.id)
      setTempPassword(String(res))
      setResetFor(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const columns: Column<UserRow>[] = [
    { key: 'username', header: 'Usuario', value: (u) => u.username },
    { key: 'nombre', header: 'Nombre', value: (u) => u.nombre },
    { key: 'email', header: 'Correo', value: (u) => u.email },
    { key: 'departamento', header: 'Departamento', value: (u) => u.departamento ?? '—' },
    { key: 'roles', header: 'Roles', value: (u) => u.roles ?? '—' },
    {
      key: 'estado', header: 'Estado',
      render: (u) => (
        <div className="flex gap-1">
          {u.activo ? <Badge tone="success"><Check size={11} /> Activo</Badge> : <Badge tone="danger"><X size={11} /> Inactivo</Badge>}
          {u.bloqueado ? <Badge tone="warning"><Ban size={11} /> Bloqueado</Badge> : null}
        </div>
      )
    }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Usuarios"
        subtitle="Administración de cuentas, estados y restablecimiento de contraseñas."
        actions={<Button onClick={openNew}><UserPlus size={15} /> Nuevo usuario</Button>}
      />
      <Card>
        <DataTable
          columns={columns}
          data={users}
          rowKey={(u) => u.id}
          searchPlaceholder="Buscar por usuario, nombre o rol…"
          actions={(u) => (
            <div className="flex justify-end gap-1">
              <button onClick={() => openEdit(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar"><Pencil size={15} /></button>
              <button onClick={() => setStatusFor({ user: u, field: 'activo', value: !u.activo })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={u.activo ? 'Desactivar' : 'Activar'}><Power size={15} /></button>
              <button onClick={() => setStatusFor({ user: u, field: 'bloqueado', value: !u.bloqueado })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={u.bloqueado ? 'Desbloquear' : 'Bloquear'}><Ban size={15} /></button>
              <button onClick={() => setResetFor(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Restablecer contraseña"><RotateCcw size={15} /></button>
            </div>
          )}
        />
      </Card>

      <Modal
        open={!!form}
        title={form?.id ? 'Editar usuario' : 'Nuevo usuario'}
        onClose={() => setForm(null)}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={() => void save()} disabled={loading}>{loading ? 'Guardando…' : 'Guardar'}</Button></>}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Usuario">
              <TextInput value={form.username} disabled={!!form.id} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Nombre">
              <TextInput value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Correo">
              <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Departamento">
              <select
                className={inputClass}
                value={form.departamentoId ?? ''}
                onChange={(e) => setForm({ ...form, departamentoId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Sin departamento</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </Field>
            <Field label="Roles" className="sm:col-span-2">
              <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                {roles.map((r) => {
                  const checked = form.roles.some((x) => x.rolId === r.id)
                  return (
                    <label key={r.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setForm({
                          ...form,
                          roles: e.target.checked
                            ? [...form.roles, { rolId: r.id, empresaId: ctx?.empresaId ?? 1 }]
                            : form.roles.filter((x) => x.rolId !== r.id)
                        })}
                      />
                      {r.nombre}
                    </label>
                  )
                })}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Usuario activo
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={!!statusFor}
        title={statusFor?.field === 'bloqueado'
          ? (statusFor.value ? 'Bloquear usuario' : 'Desbloquear usuario')
          : (statusFor?.value ? 'Activar usuario' : 'Desactivar usuario')}
        onClose={() => setStatusFor(null)}
        footer={<><Button variant="secondary" onClick={() => setStatusFor(null)}>Cancelar</Button><Button variant="danger" onClick={() => void changeStatus()}>Confirmar</Button></>}
      >
        <p className="text-sm">
          {statusFor && `Esta acción afectará a ${statusFor.user.nombre}. Las sesiones activas del usuario se cerrarán.`}
        </p>
      </Modal>

      <Modal
        open={!!resetFor}
        title="Restablecer contraseña"
        onClose={() => setResetFor(null)}
        footer={<><Button variant="secondary" onClick={() => setResetFor(null)}>Cancelar</Button><Button variant="danger" onClick={() => void doReset()}><LockKeyhole size={14} /> Restablecer</Button></>}
      >
        <p className="text-sm">Se generará una contraseña temporal y se cerrarán las sesiones de {resetFor?.nombre}. El usuario deberá cambiarla al entrar.</p>
      </Modal>

      <Modal open={!!tempPassword} title="Contraseña temporal" onClose={() => setTempPassword('')} footer={<Button onClick={() => setTempPassword('')}>Entendido</Button>}>
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Cópiela ahora: no se volverá a mostrar.</p>
        <code className="block break-all rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{tempPassword}</code>
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Field, NumberInput, TextInput } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { errorInfo } from '@/app/session'
import { useAjustesStore } from '@/app/ajustes-store'
import type { ConfigRow } from './types'

export interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'checkbox'
  default: string | number | boolean
}

/** La BD devuelve snake_case; el servicio espera camelCase. */
export function toForm(row: ConfigRow): ConfigRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value
    ])
  )
}

/** CRUD genérico de catálogos de configuración. El backend valida la tabla con lista blanca. */
export function CatalogManager({
  tabla,
  title,
  rows,
  fields,
  onSaved
}: {
  tabla: string
  title: string
  rows: ConfigRow[]
  fields: FieldDef[]
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<ConfigRow | null>(null)
  const [deleting, setDeleting] = useState<ConfigRow | null>(null)
  const [saving, setSaving] = useState(false)
  const confirmarEliminacion = useAjustesStore((s) => s.ajustes.widgets?.confirmarEliminacion)

  function openNew(): void {
    setForm(Object.fromEntries(fields.map((f) => [f.key, f.default])))
  }

  const columns: Column<ConfigRow>[] = fields.map((f) => ({
    key: f.key,
    header: f.label,
    value: (r) => String(r[f.key] ?? ''),
    render: f.type === 'checkbox'
      ? (r) => <span className={r[f.key] ? 'text-emerald-600' : 'text-slate-400'}>{r[f.key] ? 'Sí' : 'No'}</span>
      : undefined
  }))

  async function save(): Promise<void> {
    if (!form) return
    setSaving(true)
    try {
      await window.api.invoke('config.catalog.save', { tabla, data: form })
      toast.success('Registro guardado.')
      setForm(null)
      onSaved()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setSaving(false) }
  }

  async function remove(fila: ConfigRow): Promise<void> {
    if (!fila.id) return
    try {
      await window.api.invoke('config.catalog.delete', { tabla, id: fila.id })
      toast.success('Registro eliminado.')
      setDeleting(null)
      onSaved()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  return (
    <Card title={title} actions={<Button size="sm" onClick={openNew}><Plus size={14} /> Nuevo</Button>}>
      <DataTable
        columns={columns}
        data={rows.map(toForm)}
        rowKey={(r) => Number(r.id ?? 0)}
        pageSize={6}
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <button onClick={() => setForm({ ...r })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar"><Pencil size={14} /></button>
            <button onClick={() => confirmarEliminacion === false ? void remove(r) : setDeleting(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Eliminar"><Trash2 size={14} /></button>
          </div>
        )}
      />
      <Modal
        open={!!form}
        title={`${form?.id ? 'Editar' : 'Nuevo'} registro — ${title}`}
        onClose={() => setForm(null)}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>Guardar</Button></>}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === 'checkbox' ? (
                  <input type="checkbox" className="mt-2 h-4 w-4" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                ) : f.type === 'number' ? (
                  <NumberInput
                    label={f.label}
                    value={Number(form[f.key] ?? 0)}
                    onChange={(valor) => setForm({ ...form, [f.key]: valor })}
                  />
                ) : (
                  <TextInput
                    type="text"
                    value={String(form[f.key] ?? '')}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        title="Confirmar eliminación"
        onClose={() => setDeleting(null)}
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" onClick={() => { if (deleting) void remove(deleting) }}>Eliminar</Button></>}
      >
        <p className="text-sm">¿Eliminar este registro de configuración? Esta acción queda registrada en la auditoría.</p>
      </Modal>
    </Card>
  )
}

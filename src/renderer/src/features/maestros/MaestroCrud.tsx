import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pencil, Power, Trash2, Plus, Download, Upload, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { toast } from '@/components/ui/Toast'
import { can, errorInfo } from '@/app/session'
import { maestroPermiso, maestroModule, type MaestroEntidad } from '@shared/maestros'

export type FilaMaestro = Record<string, unknown> & { id: number; activo: number }

export type TipoCampo = 'text' | 'number' | 'money' | 'email' | 'select' | 'checkbox' | 'textarea'

export interface CampoDef {
  key: string
  label: string
  type?: TipoCampo
  options?: { value: string | number; label: string }[]
  hint?: string
  wide?: boolean
  required?: boolean
  /** Convierte el valor vacío en `null` (claves foráneas opcionales). */
  nullable?: boolean
}

interface Props {
  entidad: MaestroEntidad
  title: string
  subtitle: string
  columns: Column<FilaMaestro>[]
  campos: CampoDef[]
  defaults?: Record<string, unknown>
  searchPlaceholder?: string
  extraActions?: (row: FilaMaestro, reload: () => Promise<void>) => ReactNode
  extraContent?: ReactNode
}

const foreignKeys = new Set([
  'listaPrecioId', 'vendedorId', 'categoriaId', 'marcaId', 'unidadId',
  'impuestoId', 'usuarioId', 'padreId'
])

function viewValue(campo: CampoDef, valor: unknown): unknown {
  if (campo.type === 'money') return valor === undefined || valor === null ? 0 : Number(valor) / 100
  if (valor === null || valor === undefined) return ''
  return valor
}

function descargarExcel(base64: string, filename: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function saveValue(campo: CampoDef, valor: unknown): unknown {
  if (campo.type === 'checkbox') return Boolean(valor)
  if (campo.nullable && (valor === '' || valor === null || valor === undefined)) return null
  if (campo.type === 'money') return Math.round(Number(valor) * 100)
  if (campo.type === 'number') return Number(valor) || 0
  if (foreignKeys.has(campo.key)) return valor === '' || valor === null || valor === undefined ? null : Number(valor)
  return valor
}

/** CRUD de maestros. Permisos y validaciones se vuelven a verificar en el backend. */
export function MaestroCrud({
  entidad, title, subtitle, columns, campos, defaults = {},
  searchPlaceholder, extraActions, extraContent
}: Props): React.JSX.Element {
  const [rows, setRows] = useState<FilaMaestro[]>([])
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  const [confirm, setConfirm] = useState<{ row: FilaMaestro; action: 'status' | 'delete' } | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const puedeCrear = can(maestroPermiso(entidad, 'crear'))
  const puedeExportar = can(`${maestroModule(entidad)}.exportar`)
  const puedeModificar = can(maestroPermiso(entidad, 'modificar'))
  const puedeEliminar = can(maestroPermiso(entidad, 'eliminar'))

  const load = useCallback(async () => {
    try {
      setRows(await window.api.invoke<FilaMaestro[]>('maestros.list', {
        entidad, incluirInactivos: true
      }))
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [entidad])

  useEffect(() => { void load() }, [load])

  function openNew(): void {
    setForm({ ...defaults, activo: true })
  }

  function openEdit(row: FilaMaestro): void {
    setForm({ ...Object.fromEntries(campos.map((c) => [c.key, viewValue(c, row[c.key])])), id: row.id })
  }

  async function save(): Promise<void> {
    if (!form) return
    setSaving(true)
    try {
      const data: Record<string, unknown> = Object.fromEntries(
        campos.map((c) => [c.key, saveValue(c, form[c.key] ?? '')])
      )
      if (form.id) data.id = Number(form.id)
      await window.api.invoke('maestros.save', { entidad, data })
      toast.success('Registro guardado correctamente.')
      setForm(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setSaving(false) }
  }

  async function generarExcel(canal: 'maestros.plantilla' | 'maestros.exportar'): Promise<void> {
    try {
      const res = await window.api.invoke<{ filename: string; base64: string }>(canal, { entidad })
      descargarExcel(res.base64, res.filename)
      toast.success(canal === 'maestros.exportar' ? 'Archivo Excel generado.' : 'Plantilla descargada.')
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function importarArchivo(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binario = ''
      for (const byte of bytes) binario += String.fromCharCode(byte)
      const res = await window.api.invoke<{
        insertados: number
        errores: { fila: number; mensaje: string }[]
      }>('maestros.importar', { entidad, base64: btoa(binario) })
      if (res.errores.length) {
        toast.warning(`Importados ${res.insertados}. ${res.errores.length} fila(s) con errores. Primera: ${res.errores[0].mensaje}`)
      } else {
        toast.success(`Importados ${res.insertados} registros correctamente.`)
      }
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function applyConfirm(): Promise<void> {
    if (!confirm) return
    try {
      if (confirm.action === 'status') {
        await window.api.invoke('maestros.status', {
          entidad, id: confirm.row.id, activo: !confirm.row.activo
        })
        toast.success(confirm.row.activo ? 'Registro desactivado.' : 'Registro activado.')
      } else {
        await window.api.invoke('maestros.delete', { entidad, id: confirm.row.id })
        toast.success('Registro eliminado (borrado lógico).')
      }
      setConfirm(null)
      await load()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const columnas: Column<FilaMaestro>[] = [
    ...columns,
    {
      key: 'activo', header: 'Estado',
      render: (r) => r.activo
        ? <Badge tone="success">Activo</Badge>
        : <Badge tone="danger">Inactivo</Badge>
    }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={(
          <div className="flex flex-wrap gap-2">
            {puedeExportar && (
              <>
                <Button variant="secondary" onClick={() => void generarExcel('maestros.plantilla')}>
                  <FileSpreadsheet size={15} /> Plantilla
                </Button>
                <Button variant="secondary" onClick={() => void generarExcel('maestros.exportar')}>
                  <Download size={15} /> Exportar
                </Button>
              </>
            )}
            {puedeCrear && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importarArchivo(file)
                    e.target.value = ''
                  }}
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload size={15} /> Importar
                </Button>
                <Button onClick={openNew}><Plus size={15} /> Nuevo</Button>
              </>
            )}
          </div>
        )}
      />
      {extraContent}
      <Card>
        <DataTable
          columns={columnas}
          data={rows}
          rowKey={(r) => r.id}
          searchPlaceholder={searchPlaceholder ?? 'Buscar…'}
          actions={(r) => (
            <div className="flex justify-end gap-1">
              {puedeModificar && (
                <>
                  <button onClick={() => openEdit(r)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar"><Pencil size={15} /></button>
                  <button
                    onClick={() => setConfirm({ row: r, action: 'status' })}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title={r.activo ? 'Desactivar' : 'Activar'}
                  ><Power size={15} /></button>
                </>
              )}
              {puedeEliminar && (
                <button
                  onClick={() => setConfirm({ row: r, action: 'delete' })}
                  className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  title="Eliminar"
                ><Trash2 size={15} /></button>
              )}
              {extraActions?.(r, load)}
            </div>
          )}
        />
      </Card>

      <Modal
        open={!!form}
        title={form?.id ? `Editar ${title.toLowerCase()}` : `Nuevo ${title.toLowerCase()}`}
        onClose={() => setForm(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>}
      >
        {form && (
          <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {campos.map((c) => {
              const value = form[c.key]
              if (c.type === 'checkbox') {
                return (
                  <label key={c.key} className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={Boolean(value)} onChange={(e) => setForm({ ...form, [c.key]: e.target.checked })} />
                    {c.label}
                  </label>
                )
              }
              return (
                <Field key={c.key} label={c.label} hint={c.hint} className={c.wide ? 'sm:col-span-2' : ''}>
                  {c.type === 'select' ? (
                    <select
                      className={inputClass}
                      value={String(value ?? '')}
                      onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    >
                      <option value="">Ninguno</option>
                      {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : c.type === 'textarea' ? (
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={String(value ?? '')}
                      onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    />
                  ) : (
                    <TextInput
                      type={c.type === 'money' || c.type === 'number' ? 'number' : c.type === 'email' ? 'email' : 'text'}
                      step={c.type === 'money' ? '0.01' : c.type === 'number' ? 'any' : undefined}
                      required={c.required}
                      value={String(value ?? '')}
                      onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    />
                  )}
                </Field>
              )
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirm}
        title={confirm?.action === 'delete' ? 'Eliminar registro' : (confirm?.row.activo ? 'Desactivar registro' : 'Activar registro')}
        onClose={() => setConfirm(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void applyConfirm()}>Confirmar</Button>
        </>}
      >
        <p className="text-sm">
          {confirm?.action === 'delete'
            ? 'El registro quedará inactivo y se conservará en la auditoría. No se puede eliminar si está referenciado.'
            : 'El cambio de estado se registra en la auditoría.'}
        </p>
      </Modal>
    </div>
  )
}

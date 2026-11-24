import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { useSessionStore, errorInfo } from '@/app/session'

/** Modal de cambio de clave. En primer arranque es obligatorio (no se puede cerrar). */
export function ChangePasswordModal({
  open,
  forced,
  onDone
}: {
  open: boolean
  forced: boolean
  onDone: () => void
}): React.JSX.Element {
  const clearMustChange = useSessionStore((s) => s.clearMustChange)
  const refresh = useSessionStore((s) => s.refresh)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (next.length < 10) { setError('La nueva contraseña debe tener al menos 10 caracteres.'); return }
    if (!/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/\d/.test(next) || !/[^A-Za-z0-9]/.test(next)) {
      setError('Debe incluir mayúscula, minúscula, número y carácter especial.'); return
    }
    if (next !== confirm) { setError('La confirmación no coincide.'); return }
    setSaving(true)
    try {
      await window.api.invoke('auth.changePassword', { currentPassword: current, newPassword: next })
      await refresh()
      clearMustChange()
      onDone()
      setCurrent(''); setNext(''); setConfirm('')
      toast.success('Contraseña actualizada correctamente.')
    } catch (err) {
      setError(errorInfo(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={forced ? 'Cambio de contraseña obligatorio' : 'Cambiar contraseña'}
      onClose={forced ? () => {} : onDone}
      footer={forced ? undefined : <Button variant="secondary" onClick={onDone}>Cancelar</Button>}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {forced && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Por seguridad debe establecer una contraseña propia antes de utilizar el sistema.
          </p>
        )}
        <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <KeyRound size={14} /> Requisitos: 10+ caracteres, mayúscula, minúscula, número y especial.
        </p>
        {[
          { id: 'current', label: 'Contraseña actual', value: current, set: setCurrent },
          { id: 'next', label: 'Nueva contraseña', value: next, set: setNext },
          { id: 'confirm', label: 'Confirmar nueva contraseña', value: confirm, set: setConfirm }
        ].map((f) => (
          <div key={f.id}>
            <label htmlFor={f.id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {f.label}
            </label>
            <input
              id={f.id}
              type="password"
              autoComplete={f.id === 'current' ? 'current-password' : 'new-password'}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!forced && <div className="flex justify-end pt-1"><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></div>}
        {forced && <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Guardando…' : 'Establecer contraseña'}</Button>}
      </form>
    </Modal>
  )
}

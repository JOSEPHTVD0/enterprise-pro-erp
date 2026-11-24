import { useState, type FormEvent } from 'react'
import { Building2, LockKeyhole, UserRound, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSessionStore, errorInfo } from '@/app/session'
import type { EmpresaOption } from '@shared/session'

export function LoginPage(): React.JSX.Element {
  const login = useSessionStore((s) => s.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [empresaId, setEmpresaId] = useState<number | undefined>()
  const [companies, setCompanies] = useState<EmpresaOption[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (username.trim().length < 3) { setError('El usuario debe tener al menos 3 caracteres.'); return }
    if (!password) { setError('Ingrese su contraseña.'); return }
    setLoading(true)
    try {
      await login(username.trim(), password, empresaId)
    } catch (err) {
      const info = errorInfo(err)
      if (info.code === 'SELECT_COMPANY') setCompanies(info.data as EmpresaOption[])
      else setError(info.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-700 to-indigo-950 p-8 text-white md:flex">
          <div>
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <Building2 size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">ENTERPRISE PRO</h1>
            <p className="mt-1 text-sm uppercase tracking-[0.3em] text-indigo-200">ERP · Local</p>
          </div>
          <div className="space-y-3 text-sm text-indigo-100">
            <p className="flex items-center gap-2"><ShieldCheck size={16} /> Permisos por perfil y auditoría</p>
            <p className="flex items-center gap-2"><LockKeyhole size={16} /> Contraseñas con hash scrypt y sal única</p>
            <p className="flex items-center gap-2"><Building2 size={16} /> Multiempresa con datos aislados</p>
            <p className="pt-4 text-xs text-indigo-300">
              Funciona sin Internet. Datos fiscales: DOP · RNC · ITBIS · NCF.
            </p>
          </div>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-semibold">Iniciar sesión</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ingrese sus credenciales para acceder al sistema.
          </p>

          {companies.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Seleccione la empresa</p>
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setEmpresaId(c.id)
                    setCompanies([])
                    void login(username.trim(), password, c.id).catch((err) => setError(errorInfo(err).message))
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-left text-sm hover:border-indigo-500 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Building2 size={17} className="text-indigo-500" />
                  {c.nombre}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Usuario
                </label>
                <div className="relative">
                  <UserRound size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="username"
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Contraseña
                </label>
                <div className="relative">
                  <LockKeyhole size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verificando…' : 'Entrar al sistema'}
              </Button>
            </form>
          )}

          <div className="mt-6 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Primer arranque:</strong> usuario <code>admin</code>, contraseña <code>Admin1234!</code>.
            El sistema exigirá cambiarla antes de acceder.
          </div>
        </div>
      </div>
    </div>
  )
}

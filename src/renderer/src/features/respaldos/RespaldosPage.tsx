import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, DatabaseBackup, RefreshCw, Save, ShieldAlert, ShieldCheck } from 'lucide-react'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { CONFIRMACION_RESTAURACION } from '@shared/schemas/respaldos'

interface RespaldoFila {
  id: number
  fecha: string
  ruta: string
  nombre: string
  tamanoBytes: number
  tipo: string
  integridadOk: boolean
  usuario: string
  existe: boolean
}

interface Verificacion {
  ok: boolean
  resultado: string
  destino: string
  verificadoEn: string
}

interface ConfigBackup {
  carpeta: string
  frecuencia: string
  hora: string
  retencionDias: number
}

const configVacia: ConfigBackup = {
  carpeta: '', frecuencia: 'DIARIO', hora: '02:00', retencionDias: 30
}

function bytes(valor: number): string {
  if (valor < 1024) return `${valor} B`
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`
  return `${(valor / (1024 * 1024)).toFixed(2)} MB`
}

export function RespaldosPage(): React.JSX.Element {
  const [tab, setTab] = useState('historial')
  const [filas, setFilas] = useState<RespaldoFila[]>([])
  const [config, setConfig] = useState<ConfigBackup>(configVacia)
  const [verificacion, setVerificacion] = useState<Verificacion | null>(null)
  const [seleccion, setSeleccion] = useState<RespaldoFila | null>(null)
  const [paso, setPaso] = useState<0 | 1 | 2>(0)
  const [confirmacion, setConfirmacion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [procesando, setProcesando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [historial, datos] = await Promise.all([
        window.api.invoke<RespaldoFila[]>('respaldos.historial'),
        window.api.invoke<{ parametros: Record<string, string> }>('config.get')
      ])
      setFilas(historial)
      setConfig({
        carpeta: datos.parametros.backup_carpeta ?? '',
        frecuencia: datos.parametros.backup_frecuencia ?? 'DIARIO',
        hora: datos.parametros.backup_hora ?? '02:00',
        retencionDias: Number(datos.parametros.backup_retencion_dias ?? 30)
      })
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const columnas = useMemo<Column<RespaldoFila>[]>(() => [
    { key: 'fecha', header: 'Fecha', value: (f) => f.fecha.replace('T', ' ').slice(0, 19) },
    { key: 'nombre', header: 'Archivo', value: (f) => f.nombre },
    {
      key: 'tipo', header: 'Tipo', value: (f) => f.tipo,
      render: (f) => (
        <Badge tone={f.tipo === 'PRE_RESTAURACION' ? 'warning' : f.tipo === 'AUTO' ? 'info' : 'neutral'}>
          {f.tipo}
        </Badge>
      )
    },
    { key: 'tamanoBytes', header: 'Tamaño', value: (f) => bytes(f.tamanoBytes) },
    {
      key: 'integridadOk', header: 'Integridad', value: (f) => f.integridadOk ? 'Correcta' : 'Fallida',
      render: (f) => (
        <Badge tone={f.integridadOk ? 'success' : 'danger'}>
          {f.integridadOk ? 'Correcta' : 'Fallida'}
        </Badge>
      )
    },
    { key: 'usuario', header: 'Creado por', value: (f) => f.usuario }
  ], [])

  async function crearCopia(): Promise<void> {
    setProcesando(true)
    try {
      await window.api.invoke('respaldos.crear', { tipo: 'MANUAL' })
      toast.success('Copia de seguridad creada y verificada.')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function verificar(id?: number): Promise<void> {
    setProcesando(true)
    try {
      const resultado = await window.api.invoke<Verificacion>('respaldos.integridad', id ? { id } : {})
      setVerificacion(resultado)
      toast.success(resultado.ok ? 'Integridad verificada correctamente.' : 'La verificación encontró errores.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function confirmarRestauracion(): Promise<void> {
    if (!seleccion || confirmacion !== CONFIRMACION_RESTAURACION) return
    setProcesando(true)
    try {
      await window.api.invoke('respaldos.restaurar', { id: seleccion.id, confirmacion })
      toast.success('Copia marcada. Se creó una copia previa y la aplicación se reiniciará.')
      setPaso(0)
      setSeleccion(null)
      setConfirmacion('')
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function guardarConfig(): Promise<void> {
    setProcesando(true)
    try {
      await window.api.invoke('config.backup.config', config)
      toast.success('Configuración de respaldos guardada. El programador la aplica en el próximo ciclo.')
      await cargar()
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setProcesando(false)
    }
  }

  function cerrarModal(): void {
    setPaso(0)
    setSeleccion(null)
    setConfirmacion('')
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Auditoría y respaldos"
        subtitle="Copias locales consistentes de SQLite, verificación de integridad y restauración con copia previa y doble confirmación."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: 'historial', label: 'Historial' },
          { id: 'integridad', label: 'Integridad' },
          { id: 'configuracion', label: 'Configuración' }
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'historial' && (
        <Card
          title="Copias de seguridad"
          subtitle="Cada copia se verifica con PRAGMA integrity_check antes de registrarse."
          actions={can('configuracion.respaldo.crear') && (
            <Button size="sm" onClick={() => void crearCopia()} disabled={procesando}>
              <DatabaseBackup size={14} /> Crear copia ahora
            </Button>
          )}
        >
          <DataTable
            columns={columnas}
            data={filas}
            rowKey={(f) => f.id}
            pageSize={12}
            searchPlaceholder="Buscar copia…"
            emptyText="Todavía no hay copias de seguridad registradas."
            actions={(f) => (
              <div className="flex justify-end gap-1">
                {can('respaldos.consultar') && (
                  <Button variant="ghost" size="sm" onClick={() => void verificar(f.id)} disabled={procesando || !f.existe}>
                    <ShieldCheck size={14} /> Verificar
                  </Button>
                )}
                {can('configuracion.respaldo.restaurar') && (
                  <Button variant="ghost" size="sm" onClick={() => { setSeleccion(f); setPaso(1) }} disabled={procesando || !f.existe}>
                    Restaurar
                  </Button>
                )}
              </div>
            )}
          />
        </Card>
      )}

      {tab === 'integridad' && (
        <Card
          title="Verificación de integridad"
          subtitle="Lectura real de SQLite. No modifica ni repara la base automáticamente."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void verificar()} disabled={procesando}>
              <ShieldCheck size={14} /> Verificar base actual
            </Button>
          }
        >
          {verificacion ? (
            <div className={`flex items-start gap-3 rounded-lg p-4 ${verificacion.ok
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'}`}>
              {verificacion.ok ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
              <div>
                <p className="text-sm font-semibold">
                  {verificacion.ok ? 'Integridad correcta' : 'Se detectaron errores de integridad'}
                </p>
                <p className="mt-1 text-xs">{verificacion.destino} · {verificacion.resultado}</p>
                <p className="mt-1 text-[11px] opacity-70">
                  Verificado el {new Date(verificacion.verificadoEn).toLocaleString('es-DO')}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Ejecute una verificación para consultar el estado real de la base de datos.
            </p>
          )}
        </Card>
      )}

      {tab === 'configuracion' && (
        <Card
          title="Programación de copias"
          subtitle="El programador se ejecuta dentro del proceso de la aplicación, sin servicios externos."
          actions={
            can('configuracion.respaldo.crear') && (
              <Button size="sm" onClick={() => void guardarConfig()} disabled={procesando}>
                <Save size={14} /> Guardar
              </Button>
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Carpeta de respaldo">
              <TextInput value={config.carpeta} placeholder="Vacía = %APPDATA%/enterprise-pro-erp/backups"
                onChange={(e) => setConfig({ ...config, carpeta: e.target.value })} />
            </Field>
            <Field label="Frecuencia">
              <select className={inputClass} value={config.frecuencia}
                onChange={(e) => setConfig({ ...config, frecuencia: e.target.value })}>
                {['DESACTIVADO', 'DIARIO', 'SEMANAL', 'MENSUAL'].map((valor) => (
                  <option key={valor} value={valor}>{valor}</option>
                ))}
              </select>
            </Field>
            <Field label="Hora (hora local)">
              <TextInput type="time" value={config.hora}
                onChange={(e) => setConfig({ ...config, hora: e.target.value })} />
            </Field>
            <Field label="Retención (días)">
              <TextInput type="number" value={config.retencionDias}
                onChange={(e) => setConfig({ ...config, retencionDias: Number(e.target.value) })} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Las copias `PRE_RESTAURACION` nunca se eliminan por retención. La programación evalúa
            el período cada 15 segundos y respeta la hora local configurada.
          </p>
        </Card>
      )}

      <Modal
        open={paso === 1}
        title="Restaurar copia de seguridad"
        onClose={cerrarModal}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={cerrarModal}>Cancelar</Button>
            <Button size="sm" onClick={() => setPaso(2)}>Entendido, continuar</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            Esta operación reemplaza la base de datos actual por la copia seleccionada.
          </p>
          <p className="font-medium">{seleccion?.nombre}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
            <li>Se crea automáticamente una copia de la base actual antes de restaurar.</li>
            <li>La copia elegida se verifica de nuevo antes de marcar la restauración.</li>
            <li>La aplicación se reinicia para reemplazar el archivo sin dejar la BD abierta.</li>
            <li>Las sesiones activas se invalidan al reiniciar.</li>
          </ul>
        </div>
      </Modal>

      <Modal
        open={paso === 2}
        title="Confirmación final de restauración"
        onClose={cerrarModal}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPaso(1)}>Volver</Button>
            <Button variant="danger" size="sm" onClick={() => void confirmarRestauracion()}
              disabled={confirmacion !== CONFIRMACION_RESTAURACION || procesando}>
              Restaurar y reiniciar
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Para confirmar, escriba exactamente <strong>{CONFIRMACION_RESTAURACION}</strong>.</p>
          <Field label="Confirmación">
            <TextInput value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)}
              placeholder={CONFIRMACION_RESTAURACION} />
          </Field>
          <p className="text-xs text-slate-400">Archivo: {seleccion?.ruta}</p>
        </div>
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Save, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { defaultSettings, type Settings } from '@shared/settings'
import { useAppStore } from '@/app/store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, NumberInput, TextInput, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, TabPanel } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { normalizarFormato } from '@/lib/formato-impresion'

type GrupoObjeto = Exclude<keyof Settings, 'theme' | 'sidebarCollapsed'>

const pestañas = [
  { id: 'interfaz', label: 'Interfaz' },
  { id: 'impresion', label: 'Impresión y PDF' },
  { id: 'actualizaciones', label: 'Actualizaciones' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'respaldos', label: 'Respaldos' },
  { id: 'fiscal', label: 'Fiscal RD' },
  { id: 'panel', label: 'Paneles' }
]

function Opcion({
  label, value, options, onChange, hint
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (valor: string) => void
  hint?: string
}): React.JSX.Element {
  return (
    <Field label={label} hint={hint}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

function Numero({
  label, value, min, max, onChange, hint
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (valor: number) => void
  hint?: string
}): React.JSX.Element {
  return (
    <Field label={label} hint={hint}>
      <NumberInput label={label} value={value} min={min} max={max} onChange={onChange} />
    </Field>
  )
}

function Interruptor({
  label, value, onChange, hint
}: {
  label: string
  value: boolean
  onChange: (valor: boolean) => void
  hint?: string
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-indigo-600"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </label>
  )
}

/** Panel único de preferencias de la estación. Las políticas duras siguen en el backend. */
export function ConfiguracionAvanzadaPage(): React.JSX.Element {
  const setSettings = useAppStore((s) => s.setSettings)
  const [tab, setTab] = useState('interfaz')
  const [borrador, setBorrador] = useState<Settings>(() => useAppStore.getState().settings)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    window.api.settings.get().then(setBorrador).catch(() => setBorrador(defaultSettings))
  }, [])

  const cambiar = (grupo: GrupoObjeto, clave: string, valor: unknown): void => {
    setGuardado(false)
    setBorrador((prev) => ({
      ...prev,
      [grupo]: { ...(prev[grupo] as Record<string, unknown>), [clave]: valor }
    }) as Settings)
  }

  const guardar = async (): Promise<void> => {
    try {
      await setSettings(borrador)
      setGuardado(true)
      toast.success('Preferencias guardadas en este equipo.')
    } catch {
      toast.error('No se pudieron guardar las preferencias en este equipo.')
    }
  }

  const restaurar = async (): Promise<void> => {
    try {
      const leido = await window.api.settings.get()
      setBorrador(leido)
      setGuardado(false)
      toast.info('Se recargaron las preferencias guardadas.')
    } catch {
      setBorrador(defaultSettings)
      toast.error('No se pudieron leer las preferencias.')
    }
  }

  const bool = (g: GrupoObjeto, k: string): boolean => Boolean((borrador[g] as Record<string, unknown>)[k])
  const num = (g: GrupoObjeto, k: string): number => Number((borrador[g] as Record<string, unknown>)[k])
  const txt = (g: GrupoObjeto, k: string): string => String((borrador[g] as Record<string, unknown>)[k] ?? '')

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Configuración avanzada"
        subtitle="Preferencias de la estación: interfaz, impresión, actualizaciones, seguridad y paneles."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void restaurar()}>
              <RotateCcw size={14} /> Recargar
            </Button>
            <Button size="sm" onClick={() => void guardar()}>
              <Save size={14} /> Guardar
            </Button>
          </div>
        }
      />

      {guardado && <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-400">Cambios guardados.</p>}

      <Tabs tabs={pestañas} active={tab} onChange={setTab} />

      {tab === 'interfaz' && (
        <TabPanel>
          <Card title="Apariencia y experiencia" subtitle="Se aplican de inmediato en este equipo.">
            <div className="grid gap-4 md:grid-cols-2">
              <Opcion label="Tema" value={borrador.theme}
                options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }, { value: 'system', label: 'Según el sistema' }]}
                onChange={(v) => { setBorrador({ ...borrador, theme: v as Settings['theme'] }); setGuardado(false) }} />
              <Opcion label="Densidad de tablas" value={borrador.interfaz.densidad}
                options={[{ value: 'compacta', label: 'Compacta' }, { value: 'normal', label: 'Normal' }, { value: 'amplia', label: 'Amplia' }]}
                onChange={(v) => cambiar('interfaz', 'densidad', v)} />
              <Opcion label="Idioma de la interfaz" value={borrador.interfaz.idioma}
                options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English (etiquetas principales)' }]}
                onChange={(v) => cambiar('interfaz', 'idioma', v)} />
              <Opcion label="Color de acento" value={borrador.interfaz.acento}
                options={[{ value: 'indigo', label: 'Índigo' }, { value: 'verde', label: 'Verde' }, { value: 'azul', label: 'Azul' }, { value: 'ambar', label: 'Ámbar' }]}
                onChange={(v) => cambiar('interfaz', 'acento', v)}
                hint="Se refleja en el borde de acento de las tarjetas y selecciones." />
              <Numero label="Tamaño de fuente (px)" value={borrador.interfaz.tamanoFuente} min={12} max={20}
                onChange={(v) => cambiar('interfaz', 'tamanoFuente', v)} />
              <Numero label="Filas por página" value={borrador.interfaz.paginaTamano} min={5} max={100}
                onChange={(v) => cambiar('interfaz', 'paginaTamano', v)} />
              <Interruptor label="Animaciones" value={borrador.interfaz.animaciones}
                onChange={(v) => cambiar('interfaz', 'animaciones', v)} hint="Transiciones suaves entre vistas." />
              <Interruptor label="Tooltips explicativos" value={borrador.interfaz.tooltips}
                onChange={(v) => cambiar('interfaz', 'tooltips', v)} />
              <Interruptor label="Confirmar acciones sensibles" value={borrador.interfaz.confirmarAcciones}
                onChange={(v) => cambiar('interfaz', 'confirmarAcciones', v)}
                hint="Pide confirmación antes de anular o eliminar." />
            </div>
          </Card>
        </TabPanel>
      )}

      {tab === 'impresion' && (
        <TabPanel>
          <Card title="Impresión y PDF" subtitle="Formatos y comportamiento de documentos e informes.">
            <div className="grid gap-4 md:grid-cols-2">
              <Opcion label="Formato por defecto" value={normalizarFormato(txt('impresion', 'formato'))}
                options={[
                  { value: 'CARTA', label: 'Carta' }, { value: 'MEDIA', label: 'Media página' },
                  { value: 'TICKET_80', label: 'Ticket 80 mm' }, { value: 'TICKET_58', label: 'Ticket 58 mm' }
                ]}
                onChange={(v) => cambiar('impresion', 'formato', v)} />
              <Field label="Impresora preferida" hint="Nombre lógico; si está vacía se usa la predeterminada del sistema.">
                <TextInput value={txt('impresion', 'impresora')} onChange={(e) => cambiar('impresion', 'impresora', e.target.value)} />
              </Field>
              <Numero label="Copias" value={num('impresion', 'copias')} min={1} max={5}
                onChange={(v) => cambiar('impresion', 'copias', v)} />
              <Numero label="Margen (mm)" value={num('impresion', 'margenMm')} min={5} max={30}
                onChange={(v) => cambiar('impresion', 'margenMm', v)} />
              <Interruptor label="Imprimir automáticamente" value={bool('impresion', 'impresionAutomatica')}
                onChange={(v) => cambiar('impresion', 'impresionAutomatica', v)} />
              <Interruptor label="Incluir logo" value={bool('impresion', 'incluirLogo')}
                onChange={(v) => cambiar('impresion', 'incluirLogo', v)} />
              <Interruptor label="Incluir pie de página legal" value={bool('impresion', 'incluirPie')}
                onChange={(v) => cambiar('impresion', 'incluirPie', v)} />
            </div>
          </Card>
        </TabPanel>
      )}

      {tab === 'actualizaciones' && (
        <TabPanel>
          <Card title="Actualizaciones" subtitle="La descarga automática permanece desactivada por defecto.">
            <div className="grid gap-4 md:grid-cols-2">
              <Opcion label="Canal" value={txt('actualizaciones', 'canal')}
                options={[{ value: 'ESTABLE', label: 'Estable' }, { value: 'BETA', label: 'Beta / pruebas' }]}
                onChange={(v) => cambiar('actualizaciones', 'canal', v)} />
              <Interruptor label="Buscar al iniciar" value={bool('actualizaciones', 'buscarAlIniciar')}
                onChange={(v) => cambiar('actualizaciones', 'buscarAlIniciar', v)} />
              <Interruptor label="Descarga automática" value={bool('actualizaciones', 'descargaAutomatica')}
                onChange={(v) => cambiar('actualizaciones', 'descargaAutomatica', v)}
                hint="Guarda el instalador en Descargas automáticamente; nunca lo instala." />
              <Interruptor label="Notificar versiones nuevas" value={bool('actualizaciones', 'notificarVersiones')}
                onChange={(v) => cambiar('actualizaciones', 'notificarVersiones', v)} />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              La URL del feed se define con `ERP_UPDATE_URL` o `build.publish.url`.
            </p>
          </Card>
        </TabPanel>
      )}

      {tab === 'seguridad' && (
        <TabPanel>
          <Card title="Seguridad de la estación" subtitle="Preferencias visuales; las políticas mínimas se aplican en el servidor.">
            <div className="grid gap-4 md:grid-cols-2">
              <Interruptor label="Bloquear al salir" value={bool('seguridad', 'bloquearAlSalir')}
                onChange={(v) => cambiar('seguridad', 'bloquearAlSalir', v)} />
              <Interruptor label="Mostrar sesiones activas" value={bool('seguridad', 'mostrarSesiones')}
                onChange={(v) => cambiar('seguridad', 'mostrarSesiones', v)} />
              <Numero label="Aviso de inactividad (min)" value={num('seguridad', 'tiempoAvisoMin')} min={1} max={60}
                onChange={(v) => cambiar('seguridad', 'tiempoAvisoMin', v)} />
              <Interruptor label="Enmascarar RNC/cédula en listados" value={bool('seguridad', 'enmascararRnc')}
                onChange={(v) => cambiar('seguridad', 'enmascararRnc', v)} />
              <Interruptor label="Exigir clave para anular" value={bool('seguridad', 'exigirClaveAnulacion')}
                onChange={(v) => cambiar('seguridad', 'exigirClaveAnulacion', v)} />
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <SlidersHorizontal size={13} />
              Inactividad máxima, intentos fallidos y permisos se validan en el backend.
            </p>
          </Card>
        </TabPanel>
      )}

      {tab === 'respaldos' && (
        <TabPanel>
          <Card title="Respaldos" subtitle="Recordatorios y verificación de copias.">
            <div className="grid gap-4 md:grid-cols-2">
              <Numero label="Recordatorio cada (días)" value={num('respaldos', 'recordatorioDias')} min={1} max={90}
                onChange={(v) => cambiar('respaldos', 'recordatorioDias', v)} />
              <Interruptor label="Incluir preferencias" value={bool('respaldos', 'incluirPreferencias')}
                onChange={(v) => cambiar('respaldos', 'incluirPreferencias', v)} />
              <Interruptor label="Comprimir copias" value={bool('respaldos', 'compresion')}
                onChange={(v) => cambiar('respaldos', 'compresion', v)} />
              <Interruptor label="Verificar al crear" value={bool('respaldos', 'verificarAlCrear')}
                onChange={(v) => cambiar('respaldos', 'verificarAlCrear', v)} />
            </div>
          </Card>
        </TabPanel>
      )}

      {tab === 'fiscal' && (
        <TabPanel>
          <Card title="Parámetros fiscales de RD" subtitle="Preferencias de presentación; las tasas reales se configuran por empresa.">
            <div className="grid gap-4 md:grid-cols-2">
              <Opcion label="Moneda de trabajo" value={txt('fiscal', 'moneda')}
                options={[{ value: 'DOP', label: 'DOP — RD$' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }]}
                onChange={(v) => cambiar('fiscal', 'moneda', v)} />
              <Numero label="Decimales de dinero" value={num('fiscal', 'decimalesDinero')} min={0} max={4}
                onChange={(v) => cambiar('fiscal', 'decimalesDinero', v)} />
              <Opcion label="Formato de fecha" value={txt('fiscal', 'formatoFecha')}
                options={[
                  { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' }, { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' },
                  { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' }
                ]}
                onChange={(v) => cambiar('fiscal', 'formatoFecha', v)} />
              <Interruptor label="Libro 606/607 visible" value={bool('fiscal', 'libro606')}
                onChange={(v) => { cambiar('fiscal', 'libro606', v); cambiar('fiscal', 'libro607', v) }}
                hint="Muestra los libros auxiliares derivados de compras y ventas reales." />
              <Interruptor label="Recordatorio de series NCF" value={bool('fiscal', 'recordatorioNcf')}
                onChange={(v) => cambiar('fiscal', 'recordatorioNcf', v)} />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              El ERP no emite e-CF ni afirma certificación DGII; administra NCF y libros auxiliares.
            </p>
          </Card>
        </TabPanel>
      )}

      {tab === 'panel' && (
        <TabPanel>
          <Card title="Paneles e indicadores" subtitle="Qué se muestra en el dashboard ejecutivo.">
            <div className="grid gap-4 md:grid-cols-2">
              <Interruptor label="Mostrar utilidad" value={bool('panel', 'verUtilidad')}
                onChange={(v) => cambiar('panel', 'verUtilidad', v)} />
              <Interruptor label="Mostrar costos" value={bool('panel', 'verCostos')}
                onChange={(v) => cambiar('panel', 'verCostos', v)} />
              <Interruptor label="Mostrar panel de salud" value={bool('panel', 'verSalud')}
                onChange={(v) => cambiar('panel', 'verSalud', v)} />
              <Opcion label="Granularidad por defecto" value={txt('panel', 'seriesPorDefecto')}
                options={[{ value: 'DIA', label: 'Diaria' }, { value: 'MES', label: 'Mensual' }]}
                onChange={(v) => cambiar('panel', 'seriesPorDefecto', v)} />
              <Numero label="Filas en tablas del panel" value={num('panel', 'filasDashboard')} min={3} max={20}
                onChange={(v) => cambiar('panel', 'filasDashboard', v)} />
            </div>
            <div className="mt-3"><Badge tone="accent">Perfil 0.3.0</Badge></div>
          </Card>
        </TabPanel>
      )}
    </div>
  )
}

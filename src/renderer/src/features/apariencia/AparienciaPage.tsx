import { useState } from 'react'
import { Sun, Moon, Monitor, PanelLeft } from 'lucide-react'
import { useAppStore } from '@/app/store'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Select'
import { toast } from '@/components/ui/Toast'
import type { Settings } from '@shared/settings'

const themeOptions = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Según el sistema' }
]

const themePreview = {
  light: { icon: Sun, text: 'Interfaz clara, ideal para oficinas con buena iluminación.' },
  dark: { icon: Moon, text: 'Interfaz oscura, reduce la fatiga visual en ambientes bajos de luz.' },
  system: { icon: Monitor, text: 'Sigue automáticamente la configuración de Windows.' }
} as const

export function AparienciaPage(): React.JSX.Element {
  const { theme, sidebarCollapsed, settings, setTheme, setSidebarCollapsed } = useAppStore()
  const [saving, setSaving] = useState(false)
  const Preview = themePreview[theme].icon

  const notificar = (): void => {
    window.dispatchEvent(new Event('erp:preferencias-actualizadas'))
  }

  /** Guardado explícito con confirmación real contra el proceso principal. */
  async function verifyPersistence(): Promise<void> {
    setSaving(true)
    try {
      const expected: Settings = settings
      const saved = await window.api.settings.set(expected)
      const stored = await window.api.settings.get()
      if (stored.theme === saved.theme && stored.sidebarCollapsed === saved.sidebarCollapsed) {
        notificar()
        toast.success('Preferencias guardadas. Se conservarán al reiniciar la aplicación.')
      } else {
        toast.error('La verificación de guardado falló. Revisa el directorio de datos.')
      }
    } catch {
      toast.error('No se pudieron guardar las preferencias.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Apariencia"
        subtitle="Tema y comportamiento de la interfaz. Los cambios se aplican al instante y se guardan en disco."
        actions={
          <Button onClick={() => void verifyPersistence()} disabled={saving}>
            {saving ? 'Verificando…' : 'Verificar guardado'}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tema" subtitle="Modo claro, oscuro o automático">
          <div className="space-y-4">
            <Select
              label="Tema de la aplicación"
              options={themeOptions}
              value={theme}
              onChange={(e) => { setTheme(e.target.value as Settings['theme']); notificar() }}
            />
            <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <Preview size={20} className="mt-0.5 shrink-0 text-indigo-500" />
              <p className="text-sm text-slate-600 dark:text-slate-300">{themePreview[theme].text}</p>
            </div>
            <p className="text-xs text-slate-400">
              Atajo: el botón de tema en la barra superior alterna claro → oscuro → sistema.
            </p>
          </div>
        </Card>

        <Card title="Menú lateral" subtitle="Organización del espacio de trabajo">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <PanelLeft size={20} className="mt-0.5 shrink-0 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium">Menú contraído</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Muestra solo iconos para ganar espacio en pantalla.
                  </p>
                </div>
              </div>
              <Button
                variant={sidebarCollapsed ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => { setSidebarCollapsed(!sidebarCollapsed); notificar() }}
                aria-pressed={sidebarCollapsed}
              >
                {sidebarCollapsed ? 'Contraído' : 'Expandido'}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Atajo de teclado: <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">Ctrl</kbd>
              {' + '}
              <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">B</kbd> contrae o expande el menú.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

import { RefreshCw } from 'lucide-react'
import type { ImpresoraInfo } from '@shared/schemas/impresion'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'

interface SelectorImpresoraProps {
  value: string
  impresoras: ImpresoraInfo[]
  cargando?: boolean
  detectando?: boolean
  onDetectar: () => void
  onChange: (nombre: string) => void
  label?: string
  hint?: string
  id?: string
}

/** Muestra únicamente impresoras reales devueltas por el sistema operativo. */
export function SelectorImpresora({
  value, impresoras, cargando = false, detectando = false, onDetectar, onChange,
  label = 'Impresora', hint, id
}: SelectorImpresoraProps): React.JSX.Element {
  const desc = impresoras.find((impresora) => impresora.name === value)
  const ayudas = [
    hint,
    impresoras.length === 0 && !detectando
      ? 'No se detectaron impresoras. Use la predeterminada del sistema o vuelva a detectar.'
      : undefined,
    desc?.description
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-2">
      <Field label={label} hint={ayudas || undefined}>
        <div className="flex gap-2">
          <select
            id={id}
            className={inputClass}
            value={value}
            disabled={cargando}
            onChange={(evento) => onChange(evento.target.value)}
          >
            <option value="">Predeterminada del sistema</option>
            {impresoras.map((impresora) => (
              <option key={impresora.name} value={impresora.name}>
                {impresora.displayName || impresora.name}{impresora.isDefault ? ' (predeterminada)' : ''}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDetectar}
            disabled={detectando}
            aria-label="Detectar impresoras"
          >
            <RefreshCw size={14} className={detectando ? 'animate-spin' : ''} />
            Detectar
          </Button>
        </div>
      </Field>
      {value && impresoras.length > 0 && !desc && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          La impresora guardada no está conectada actualmente; se usará la predeterminada del sistema.
        </p>
      )}
    </div>
  )
}

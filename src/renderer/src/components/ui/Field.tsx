import {
  cloneElement, isValidElement, useEffect, useId, useState,
  type InputHTMLAttributes, type ReactNode
} from 'react'

export const inputClass =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800'

type ConAria = { id?: string; 'aria-describedby'?: string }

export function Field({
  label,
  children,
  hint,
  className = ''
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}): React.JSX.Element {
  const generado = useId()
  const hintId = `${generado}-hint`
  const props = isValidElement<ConAria>(children) ? children.props : undefined
  const id = props?.id ?? generado
  const descritoPor = [props?.['aria-describedby'], hint ? hintId : undefined]
    .filter(Boolean).join(' ') || undefined
  const control = isValidElement<ConAria>(children)
    ? cloneElement(children, { id, 'aria-describedby': descritoPor })
    : children

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      {control}
      {hint && <p id={hintId} className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const { type, inputMode, ...rest } = props
  const numerico = type === 'number'
  return (
    <input
      {...rest}
      type={numerico ? 'text' : type}
      inputMode={numerico ? 'decimal' : inputMode}
      className={`${inputClass} ${props.className ?? ''}`}
    />
  )
}

/**
 * Convierte el borrador solo al salir/Enter. Mientras se escribe se conserva el
 * texto exacto (`', '`, punto decimal, signo, notación exponencial), de modo que
 * no se pierde la tecla ni se fuerza un `0` al vaciar el campo.
 */
export function parseNumericDraft(
  texto: string,
  min: number,
  max: number,
  permitirDecimal: boolean
): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  const valor = Number(limpio)
  if (!Number.isFinite(valor)) return null
  const normalizado = permitirDecimal ? valor : Math.trunc(valor)
  return Math.min(max, Math.max(min, normalizado))
}

export function NumberInput({
  label, value, min = 0, max = Number.MAX_SAFE_INTEGER, decimal = false,
  disabled = false, className = '', id, 'aria-describedby': ariaDescritoPor, onChange
}: {
  label: string
  value: number
  min?: number
  max?: number
  decimal?: boolean
  disabled?: boolean
  className?: string
  id?: string
  'aria-describedby'?: string
  onChange: (valor: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(() => String(value))
  const [enfocado, setEnfocado] = useState(false)

  useEffect(() => {
    if (!enfocado) setDraft(String(value))
  }, [value, enfocado])

  const confirmar = (): void => {
    const convertido = parseNumericDraft(draft, min, max, decimal)
    if (convertido === null) {
      setDraft(String(value))
      return
    }
    setDraft(String(convertido))
    onChange(convertido)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-describedby={ariaDescritoPor}
      disabled={disabled}
      value={draft}
      className={`${inputClass} ${className}`}
      onFocus={() => setEnfocado(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { confirmar(); setEnfocado(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          confirmar()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setDraft(String(value))
          e.currentTarget.blur()
        }
      }}
    />
  )
}

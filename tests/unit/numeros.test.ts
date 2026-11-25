import { describe, it, expect } from 'vitest'
import { parseNumericDraft } from '@/components/ui/Field'

describe('entrada numérica continua', () => {
  it('conserva borradores intermedios sin convertirlos a cero', () => {
    expect(parseNumericDraft('', 0, 100, false)).toBeNull()
    expect(parseNumericDraft('-', 0, 100, false)).toBeNull()
    expect(parseNumericDraft('1.', 0, 100, true)).toBe(1)
    expect(parseNumericDraft('1e', 0, 100, true)).toBeNull()
  })

  it('acepta coma decimal y limita al rango configurado', () => {
    expect(parseNumericDraft('1,25', 0, 10, true)).toBe(1.25)
    expect(parseNumericDraft('1,25', 0, 10, false)).toBe(1)
    expect(parseNumericDraft('999', 0, 100, false)).toBe(100)
    expect(parseNumericDraft('-5', -10, 10, false)).toBe(-5)
  })
})

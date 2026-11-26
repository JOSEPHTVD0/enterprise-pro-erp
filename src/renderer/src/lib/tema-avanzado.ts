import { defaultAjustes, type Ajustes } from '@shared/schemas/ajustes'

const acentos: Record<Ajustes['tema']['colorAcento'], string> = {
  INDIGO: '#4f46e5', VERDE: '#059669', AZUL: '#0284c7', AMBAR: '#d97706'
}

const fuentes: Record<Ajustes['tema']['fuente'], string> = {
  SISTEMA: 'var(--font-sans)',
  SANS: 'system-ui, "Segoe UI", sans-serif',
  SERIF: 'Georgia, "Times New Roman", serif'
}

/** Normaliza valores heredados o corruptos antes de tocar el DOM. */
export function normalizarTemaAvanzado(tema?: Partial<Ajustes['tema']>): Ajustes['tema'] {
  const base = defaultAjustes.tema
  const escala = Number(tema?.escala)
  const radio = tema?.radio
  const fuente = tema?.fuente
  const colorAcento = tema?.colorAcento
  return {
    escala: Number.isFinite(escala) ? Math.min(1.3, Math.max(0.8, escala)) : base.escala,
    radio: radio === 'NINGUNO' || radio === 'SUAVE' || radio === 'REDONDO' ? radio : base.radio,
    fuente: fuente === 'SISTEMA' || fuente === 'SANS' || fuente === 'SERIF' ? fuente : base.fuente,
    colorAcento: colorAcento && colorAcento in acentos ? colorAcento : base.colorAcento,
    reducirMovimiento: Boolean(tema?.reducirMovimiento),
    altoContraste: Boolean(tema?.altoContraste)
  }
}

/** Aplica variables CSS administradas desde el centro de control. Sin CSS libre. */
export function aplicarTemaAvanzado(tema?: Ajustes['tema']): void {
  if (!tema) return
  const valido = normalizarTemaAvanzado(tema)
  const root = document.documentElement
  root.style.setProperty('--erp-escala', String(valido.escala))
  root.style.setProperty('--erp-radio', valido.radio === 'NINGUNO' ? '0px' : valido.radio === 'REDONDO' ? '18px' : '10px')
  root.style.setProperty('--erp-acento', acentos[valido.colorAcento])
  root.style.setProperty('--erp-font', fuentes[valido.fuente])
  root.classList.toggle('erp-reducir-movimiento', valido.reducirMovimiento)
  root.classList.toggle('erp-alto-contraste', valido.altoContraste)
}

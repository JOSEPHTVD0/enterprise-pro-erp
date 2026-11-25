import type { Ajustes } from '@shared/schemas/ajustes'

const acentos: Record<Ajustes['tema']['colorAcento'], string> = {
  INDIGO: '#4f46e5', VERDE: '#059669', AZUL: '#0284c7', AMBAR: '#d97706'
}

const fuentes: Record<Ajustes['tema']['fuente'], string> = {
  SISTEMA: 'var(--font-sans)',
  SANS: 'system-ui, "Segoe UI", sans-serif',
  SERIF: 'Georgia, "Times New Roman", serif'
}

/** Aplica variables CSS administradas desde el centro de control. Sin CSS libre. */
export function aplicarTemaAvanzado(tema?: Ajustes['tema']): void {
  if (!tema) return
  const root = document.documentElement
  root.style.setProperty('--erp-escala', String(tema.escala))
  root.style.setProperty('--erp-radio', tema.radio === 'NINGUNO' ? '0px' : tema.radio === 'REDONDO' ? '18px' : '10px')
  root.style.setProperty('--erp-acento', acentos[tema.colorAcento])
  root.style.setProperty('--erp-font', fuentes[tema.fuente])
  root.classList.toggle('erp-reducir-movimiento', tema.reducirMovimiento)
  root.classList.toggle('erp-alto-contraste', tema.altoContraste)
}

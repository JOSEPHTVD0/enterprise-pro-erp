import { useEffect } from 'react'
import { create } from 'zustand'
import { defaultSettings, type Settings } from '@shared/settings'
import {
  defaultAjustes, flujosSchema, integracionesSchema, rendimientoSchema, seguridadAvanzadaSchema,
  type Ajustes, type AjustesGet
} from '@shared/schemas/ajustes'
import { useAppStore } from '@/app/store'
import { normalizarAjustesEfectivos, useAjustesStore } from '@/app/ajustes-store'
import { aplicarPreferenciasImpresion } from '@/lib/formato-impresion'

const moneyFormatter = new Intl.NumberFormat('es-DO', {
  style: 'currency', currency: 'DOP', minimumFractionDigits: 2
})

/** El backend guarda centavos enteros; la UI muestra RD$. */
export function money(centavos: number): string {
  return moneyFormatter.format((Number(centavos) || 0) / 100)
}

export function number(value: unknown): string {
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 4 }).format(Number(value) || 0)
}

/** Grupos que el canal de ajustes efectivos no expone a todos los perfiles. */
type GrupoOperativo = 'flujos' | 'seguridad' | 'integraciones' | 'rendimiento'
type Operativos = Pick<Ajustes, GrupoOperativo>

const gruposOperativos: GrupoOperativo[] = ['flujos', 'seguridad', 'integraciones', 'rendimiento']
const esquemasOperativos = {
  flujos: flujosSchema,
  seguridad: seguridadAvanzadaSchema,
  integraciones: integracionesSchema,
  rendimiento: rendimientoSchema
}

interface OperativosState {
  datos: Operativos
  cargado: boolean
  cargando: boolean
  cargar: () => Promise<void>
  recargar: () => Promise<void>
}

const operativosPorDefecto: Operativos = {
  flujos: defaultAjustes.flujos,
  seguridad: defaultAjustes.seguridad,
  integraciones: defaultAjustes.integraciones,
  rendimiento: defaultAjustes.rendimiento
}

/**
 * Lectura opcional de grupos operativos. Si el perfil no tiene permiso de
 * consulta se conservan los defaults validados: el backend sigue siendo la
 * autoridad y nunca se escalan privilegios desde el renderer.
 */
export const useAjustesOperativos = create<OperativosState>((set, get) => ({
  datos: operativosPorDefecto,
  cargado: false,
  cargando: false,

  cargar: async () => {
    if (get().cargado || get().cargando) return
    set({ cargando: true })
    const datos = { ...operativosPorDefecto } as Record<string, unknown>
    for (const grupo of gruposOperativos) {
      try {
        const respuesta = await window.api.invoke<Partial<Ajustes>>('config.ajustes.get', { grupo })
        const valor = respuesta?.[grupo]
        if (valor === undefined) continue
        const validado = esquemasOperativos[grupo].safeParse(valor)
        if (validado.success) datos[grupo] = validado.data
      } catch {
        // Sin permiso para leer el grupo: se mantiene el default validado.
      }
    }
    set({ datos: datos as Operativos, cargado: true, cargando: false })
  },

  recargar: async () => {
    set({ cargado: false, cargando: false })
    await get().cargar()
  }
}))

export function useAjustesOperativosCargados(): Operativos {
  const datos = useAjustesOperativos((s) => s.datos)
  useEffect(() => { void useAjustesOperativos.getState().cargar() }, [])
  return datos
}

const acentos = {
  indigo: '#4f46e5', verde: '#059669', azul: '#0284c7', ambar: '#d97706'
} as const

export type DensidadEfectiva = 'compacta' | 'normal' | 'amplia'
export type AcentoEfectivo = keyof typeof acentos

export interface PreferenciasInterfaz {
  densidad: DensidadEfectiva
  tooltips: boolean
  confirmarAcciones: boolean
  tamanoFuente: number
  acento: AcentoEfectivo
  reducirMovimiento: boolean
  modoBajoConsumo: boolean
  ocultarCostos: boolean
  mascararRnc: boolean
  avisoBloqueoMin: number
  paginaTamano: number
  formatosPermitidos: string[]
  estadosOrden: string[]
  alertas: Ajustes['alertas']
  notificaciones: Ajustes['notificaciones']
  panel2026: Ajustes['panel2026']
}

/**
 * Una sola resolución para estación + empresa. Evita clases duplicadas: la
 * densidad compacta del `<main>` ya la aplica el shell; aquí solo se calcula
 * el valor efectivo y se derivan el resto de preferencias visuales.
 */
export function resolverPreferencias(
  settings: Settings, ajustes: AjustesGet, operativos: Operativos
): PreferenciasInterfaz {
  const efectivos = normalizarAjustesEfectivos(ajustes)
  const interfaz = settings.interfaz
  const densidadTablas = efectivos.interfaz.densidadTablas
  const densidad: DensidadEfectiva = interfaz.densidad === 'compacta' || densidadTablas === 'compacta'
    ? 'compacta'
    : interfaz.densidad === 'amplia' ? 'amplia' : 'normal'

  const colorEmpresa = efectivos.tema.colorAcento
  const candidatoAcento = colorEmpresa !== 'INDIGO'
    ? colorEmpresa.toLowerCase()
    : interfaz.acento
  const acento: AcentoEfectivo = candidatoAcento in acentos ? candidatoAcento as AcentoEfectivo : 'indigo'

  const tamano = Number(interfaz.tamanoFuente)
  const avisoEmpresa = Number(operativos.seguridad.avisoAntesDeBloqueoMin)
  const avisoEstacion = Number(settings.seguridad.tiempoAvisoMin)
  const paginaEstacion = Number(interfaz.paginaTamano)

  return {
    densidad,
    tooltips: interfaz.tooltips,
    confirmarAcciones: interfaz.confirmarAcciones,
    tamanoFuente: Number.isFinite(tamano) ? Math.min(20, Math.max(12, Math.round(tamano))) : 14,
    acento,
    reducirMovimiento: !interfaz.animaciones || efectivos.tema.reducirMovimiento,
    modoBajoConsumo: operativos.rendimiento.modoBajoConsumo,
    ocultarCostos: operativos.seguridad.ocultarCostosEnListados,
    mascararRnc: operativos.seguridad.mascararRnc || settings.seguridad.enmascararRnc,
    avisoBloqueoMin: Math.min(30, Math.max(1,
      Number.isFinite(avisoEmpresa) && avisoEmpresa > 0 ? avisoEmpresa : avisoEstacion
    )),
    // Prevalece la estación solo si el usuario la cambió respecto al default.
    paginaTamano: Number.isFinite(paginaEstacion) && paginaEstacion !== defaultSettings.interfaz.paginaTamano
      ? Math.min(100, Math.max(5, Math.round(paginaEstacion)))
      : efectivos.widgets.tamanoPagina,
    formatosPermitidos: operativos.integraciones.formatos,
    estadosOrden: [...operativos.flujos.estadosOrden],
    alertas: efectivos.alertas,
    notificaciones: efectivos.notificaciones,
    panel2026: efectivos.panel2026
  }
}

export function preferenciasActuales(): PreferenciasInterfaz {
  return resolverPreferencias(
    useAppStore.getState().settings,
    useAjustesStore.getState().ajustes,
    useAjustesOperativos.getState().datos
  )
}

export function usePreferenciasInterfaz(): PreferenciasInterfaz {
  const settings = useAppStore((s) => s.settings)
  const ajustes = useAjustesStore((s) => s.ajustes)
  const operativos = useAjustesOperativosCargados()
  return resolverPreferencias(settings, ajustes, operativos)
}

/** Recarga ambas fuentes y reaplica el documento. Útil tras guardar ajustes. */
export async function recargarPreferencias(): Promise<void> {
  await Promise.all([
    useAjustesStore.getState().recargar(),
    useAjustesOperativos.getState().recargar()
  ])
  aplicarPreferenciasGlobal(preferenciasActuales())
}

/** `title` condicional: sin tooltips no se emiten atributos de ayuda. */
export function titleSi(activo: boolean, texto: string): string | undefined {
  return activo ? texto : undefined
}

/** Confirmación para acciones destructivas; desactivarla solo afecta al aviso visual. */
export function confirmarAccion(mensaje: string): boolean {
  if (!useAppStore.getState().settings.interfaz.confirmarAcciones) return true
  return window.confirm(mensaje)
}

/** Borrados visibles en DataTable/CatalogManager respetan ambas políticas. */
export function confirmarEliminacion(mensaje: string): boolean {
  const settings = useAppStore.getState().settings
  const widgets = useAjustesStore.getState().ajustes.widgets
  if (!settings.interfaz.confirmarAcciones || widgets?.confirmarEliminacion === false) return true
  return window.confirm(mensaje)
}

/** Capa visual: nunca sustituye a los permisos `inventario.costo` ni `reportes.costo`. */
export function mascararRncVisual(valor: unknown, activo: boolean): string {
  const texto = String(valor ?? '')
  if (!activo || texto.length === 0) return texto
  if (texto.length <= 4) return '•'.repeat(texto.length)
  return `${texto.slice(0, 3)}${'•'.repeat(Math.max(3, texto.length - 5))}${texto.slice(-2)}`
}

const niveles = { INFO: 0, MEDIO: 1, ALTO: 2 } as const

export function nivelVisible(nivel: string, minimo: 'INFO' | 'MEDIO' | 'ALTO'): boolean {
  const texto = nivel.toUpperCase() === 'CRITICO' ? 'ALTO' : nivel.toUpperCase()
  const valor = texto in niveles ? texto as keyof typeof niveles : 'INFO'
  return niveles[valor] >= niveles[minimo]
}

/** Clasifica una alerta local para que `notificaciones.eventos` pueda filtrarla. */
export function eventoDeTexto(texto: string): 'STOCK_BAJO' | 'CXC_VENCIDO' | 'SERIE_ALERTA' | null {
  const valor = texto.toUpperCase()
  if (/SERIE|CORRELATIVO|NCF/.test(valor)) return 'SERIE_ALERTA'
  if (/CXC|COBR|VENCID/.test(valor)) return 'CXC_VENCIDO'
  if (/STOCK|EXISTENC|AGOTAD/.test(valor)) return 'STOCK_BAJO'
  return null
}

/** Solo se aplica un padding fijo derivado del enum validado, sin CSS arbitrario. */
export function aplicarDensidadTablas(densidad: DensidadEfectiva): void {
  const root = document.documentElement
  root.dataset.erpDensidad = densidad
  document.querySelectorAll<HTMLTableCellElement>('main table th, main table td').forEach((celda) => {
    if (densidad === 'amplia') {
      celda.dataset.erpDensidadAmplia = '1'
      celda.style.paddingTop = '0.6rem'
      celda.style.paddingBottom = '0.6rem'
    } else if (celda.dataset.erpDensidadAmplia === '1') {
      celda.style.removeProperty('padding-top')
      celda.style.removeProperty('padding-bottom')
      delete celda.dataset.erpDensidadAmplia
    }
  })
}

/** Aplica estación y empresa al documento. Se llama tras los efectos del tema. */
export function aplicarPreferenciasGlobal(pref: PreferenciasInterfaz): void {
  const root = document.documentElement
  root.style.setProperty('--erp-acento', acentos[pref.acento])
  root.style.setProperty('--erp-tamano-fuente', `${pref.tamanoFuente}px`)
  root.dataset.erpTooltips = String(pref.tooltips)
  root.dataset.erpConfirmarAcciones = String(pref.confirmarAcciones)
  root.dataset.erpModoBajoConsumo = String(pref.modoBajoConsumo)
  document.body.style.fontSize = `${pref.tamanoFuente}px`
  root.classList.toggle('erp-reducir-movimiento', pref.reducirMovimiento)
  aplicarDensidadTablas(pref.densidad)
  aplicarPreferenciasImpresion(useAppStore.getState().settings, pref.mascararRnc)
}

/**
 * Las tablas y el área de impresión se montan dinámicamente; este observador
 * reaplica solo valores fijos derivados de enums/enteros validados.
 */
export function instalarObservadorPreferencias(): () => void {
  let pendiente = false
  const aplicar = (): void => {
    if (pendiente) return
    pendiente = true
    queueMicrotask(() => {
      pendiente = false
      const pref = preferenciasActuales()
      aplicarDensidadTablas(pref.densidad)
      aplicarPreferenciasImpresion(useAppStore.getState().settings, pref.mascararRnc)
    })
  }
  const observador = new MutationObserver(aplicar)
  observador.observe(document.body, { childList: true, subtree: true })
  aplicar()
  return () => observador.disconnect()
}

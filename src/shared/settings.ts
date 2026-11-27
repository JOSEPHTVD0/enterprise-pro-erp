import { z } from 'zod'
import { conDefaultsDeObjetoVacio } from './schemas/defaults'
import { formatosImpresion } from './schemas/ventas'
import { modosImpresion, orientacionesImpresion } from './schemas/impresion'

/**
 * Preferencias persistidas en disco (proceso principal). Las políticas duras de
 * seguridad (sesión, intentos, permisos) se verifican en el backend y no pueden
 * relajarse desde aquí; estos valores son preferencias de la estación.
 */
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  sidebarCollapsed: z.boolean().default(false),
  interfaz: conDefaultsDeObjetoVacio(z.object({
    densidad: z.enum(['compacta', 'normal', 'amplia']).default('normal'),
    tamanoFuente: z.number().int().min(12).max(20).default(14),
    idioma: z.enum(['es', 'en']).default('es'),
    acento: z.enum(['indigo', 'verde', 'azul', 'ambar']).default('indigo'),
    animaciones: z.boolean().default(true),
    tooltips: z.boolean().default(true),
    confirmarAcciones: z.boolean().default(true),
    paginaTamano: z.number().int().min(5).max(100).default(10)
  })),
  impresion: conDefaultsDeObjetoVacio(z.object({
    formato: z.preprocess(
      (valor) => valor === 'TICKET80' ? 'TICKET_80' : valor === 'TICKET58' ? 'TICKET_58' : valor,
      z.enum(formatosImpresion).default('CARTA')
    ),
    impresora: z.string().max(200).default(''),
    modo: z.enum(modosImpresion).default('DIALOGO'),
    /** Impresora elegida por tipo de documento; prevalece sobre la general. */
    impresorasPorDocumento: z.record(z.string(), z.string().max(200)).default({}),
    /** Modo (silencioso o diálogo) por tipo de documento; prevalece sobre el general. */
    modosPorDocumento: z.record(z.string(), z.enum(modosImpresion)).default({}),
    impresionAutomatica: z.boolean().default(false),
    incluirLogo: z.boolean().default(true),
    incluirPie: z.boolean().default(true),
    copias: z.number().int().min(1).max(5).default(1),
    margenMm: z.number().int().min(5).max(30).default(12),
    color: z.boolean().default(true),
    fondo: z.boolean().default(true),
    orientacion: z.enum(orientacionesImpresion).default('VERTICAL')
  })),
  actualizaciones: conDefaultsDeObjetoVacio(z.object({
    canal: z.enum(['ESTABLE', 'BETA']).default('ESTABLE'),
    buscarAlIniciar: z.boolean().default(false),
    descargaAutomatica: z.boolean().default(false),
    notificarVersiones: z.boolean().default(true)
  })),
  seguridad: conDefaultsDeObjetoVacio(z.object({
    bloquearAlSalir: z.boolean().default(true),
    mostrarSesiones: z.boolean().default(true),
    tiempoAvisoMin: z.number().int().min(1).max(60).default(5),
    enmascararRnc: z.boolean().default(false),
    exigirClaveAnulacion: z.boolean().default(false)
  })),
  respaldos: conDefaultsDeObjetoVacio(z.object({
    recordatorioDias: z.number().int().min(1).max(90).default(7),
    incluirPreferencias: z.boolean().default(true),
    compresion: z.boolean().default(true),
    verificarAlCrear: z.boolean().default(true)
  })),
  fiscal: conDefaultsDeObjetoVacio(z.object({
    moneda: z.enum(['DOP', 'USD', 'EUR']).default('DOP'),
    decimalesDinero: z.number().int().min(0).max(4).default(2),
    formatoFecha: z.enum(['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy']).default('dd/MM/yyyy'),
    libro606: z.boolean().default(true),
    libro607: z.boolean().default(true),
    recordatorioNcf: z.boolean().default(true)
  })),
  panel: conDefaultsDeObjetoVacio(z.object({
    verUtilidad: z.boolean().default(true),
    verCostos: z.boolean().default(true),
    verSalud: z.boolean().default(true),
    seriesPorDefecto: z.enum(['DIA', 'MES']).default('MES'),
    filasDashboard: z.number().int().min(3).max(20).default(8)
  }))
})

export type Settings = z.infer<typeof settingsSchema>

/** Defaults derivados del esquema: evita duplicar valores y respeta Zod 4. */
export const defaultSettings: Settings = settingsSchema.parse({})

/** Resuelve el tema efectivo. Función pura, cubierta por pruebas. */
export function resolveTheme(theme: Settings['theme'], systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light'
  return theme
}

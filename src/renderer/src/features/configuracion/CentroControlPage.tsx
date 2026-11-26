import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Pencil, Plus, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  moduleLabels, modules, type ModuleKey, type PermissionDef
} from '@shared/permissions'
import {
  ajustesGrupos, ajustesGruposVisuales, defaultAjustes, modulosProtegidos,
  vistasPersonalizables, type Ajustes, type AjustesGrupo, type WidgetId
} from '@shared/schemas/ajustes'
import type { AjustesAmbito } from '@shared/schemas/personalizacion'
import { coincideTexto, normalizarTexto } from '@shared/texto'
import { ajustesConDefaults, useAjustesStore } from '@/app/ajustes-store'
import { aplicarTemaAvanzado } from '@/lib/tema-avanzado'
import { can, errorInfo, useSessionStore } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, NumberInput, TextInput, inputClass } from '@/components/ui/Field'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'

interface RoleRow { id: number; nombre: string; descripcion: string; total_permisos: number }
interface RoleDetail {
  id: number
  nombre: string
  descripcion: string
  bloqueado: boolean
  permisos: PermissionDef[]
}
interface PermisoPersonalizadoForm {
  key: string
  label: string
  descripcion: string
  module: ModuleKey
  critico: boolean
}
interface CapaAjuste {
  ambito: AjustesAmbito
  objetivo: string
  grupo: AjustesGrupo
  datos_json: string
  actualizado_en: string
  usuario_id: number | null
}
interface CapaForm {
  ambito: AjustesAmbito
  objetivo: string
  grupo: (typeof ajustesGruposVisuales)[number]
  datos: Record<string, unknown>
  editando: boolean
}

type TipoCampo = 'bool' | 'num' | 'decimal' | 'text' | 'select' | 'multi'
interface Campo {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  opciones?: { value: string; label: string }[]
  min?: number
  max?: number
  paso?: number
  hint?: string
}

const opcionesSiNo = [
  { value: 'PANEL', label: 'Panel' }, { value: 'TOAST', label: 'Aviso flotante' }
]
const opcionesEventos = [
  'VENTA', 'COMPRA', 'STOCK_BAJO', 'CXC_VENCIDO', 'SERIE_ALERTA', 'BACKUP', 'ACTUALIZACION'
].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))

/** Plantillas administrativas: aplican solo grupos visuales auditables. */
const plantillasInterfaz: {
  id: string
  label: string
  descripcion: string
  cambios: Partial<Pick<Ajustes, 'tema' | 'widgets' | 'interfaz'>>
}[] = [
  {
    id: 'clasico', label: 'Clásico', descripcion: 'Escala, paneles y menú con valores estándar.',
    cambios: { tema: defaultAjustes.tema, widgets: defaultAjustes.widgets, interfaz: defaultAjustes.interfaz }
  },
  {
    id: 'compacto', label: 'Compacto', descripcion: 'Más filas visibles, menú estrecho y sin radios.',
    cambios: {
      tema: { ...defaultAjustes.tema, escala: 0.92, radio: 'NINGUNO', reducirMovimiento: true },
      widgets: { ...defaultAjustes.widgets, densidad: 'compacta', tamanoPagina: 20, filas: 6 },
      interfaz: { ...defaultAjustes.interfaz, densidadTablas: 'compacta', anchoSidebar: 210 }
    }
  },
  {
    id: 'visibilidad', label: 'Alta visibilidad', descripcion: 'Contraste reforzado, texto mayor y movimiento reducido.',
    cambios: {
      tema: { ...defaultAjustes.tema, escala: 1.12, colorAcento: 'AZUL', altoContraste: true, reducirMovimiento: true },
      widgets: { ...defaultAjustes.widgets, densidad: 'normal', tamanoPagina: 10 },
      interfaz: { ...defaultAjustes.interfaz, densidadTablas: 'normal', anchoSidebar: 260, mostrarIconos: true }
    }
  },
  {
    id: 'presentacion', label: 'Presentación', descripcion: 'Pantalla despejada para proyectar indicadores.',
    cambios: {
      tema: { ...defaultAjustes.tema, escala: 1.2, reducirMovimiento: true },
      widgets: { ...defaultAjustes.widgets, densidad: 'compacta', filas: 6 },
      interfaz: { ...defaultAjustes.interfaz, ocultarElementos: ['distintivoFase'], piePersonalizado: '' }
    }
  }
]

const grupos: { id: AjustesGrupo; label: string; descripcion: string }[] = [
  { id: 'alertas', label: 'Alertas', descripcion: 'Umbrales y nivel mínimo de las señales tempranas.' },
  { id: 'flujos', label: 'Flujos', descripcion: 'Aprobaciones, motivos y estados de orden de servicio.' },
  { id: 'widgets', label: 'Paneles', descripcion: 'Visibilidad, orden y frecuencia de actualización.' },
  { id: 'panel2026', label: 'Panel 2026', descripcion: 'Vistas, umbrales y proyección del panel operativo avanzado.' },
  { id: 'rendimiento', label: 'Rendimiento', descripcion: 'Límites, caché y modo de bajo consumo.' },
  { id: 'integraciones', label: 'Integraciones', descripcion: 'Exportación local e impresora de tickets.' },
  { id: 'tema', label: 'Tema avanzado', descripcion: 'Escala, radios, contraste y movimiento.' },
  { id: 'fiscal', label: 'Fiscal avanzado', descripcion: 'NCF, moneda base y redondeo bancario.' },
  { id: 'notificaciones', label: 'Notificaciones', descripcion: 'Sonido, duración y eventos avisados.' },
  { id: 'seguridad', label: 'Seguridad', descripcion: 'Refuerzos visuales; las políticas duras siguen en backend.' },
  { id: 'featureFlags', label: 'Módulos', descripcion: 'Módulos opcionales visibles para todos los perfiles.' },
  { id: 'interfaz', label: 'Interfaz y menú', descripcion: 'Título, ancho del menú, densidad y elementos ocultables.' }
]

const campos: Record<AjustesGrupo, Campo[]> = {
  alertas: [
    { clave: 'stockBajoUmbral', etiqueta: 'Umbral de stock bajo', tipo: 'num', min: 0, max: 100000 },
    { clave: 'seriesRestantes', etiqueta: 'Avisar series restantes', tipo: 'num', min: 0, max: 1000 },
    { clave: 'cxcDiasVencimiento', etiqueta: 'Días de CxC para aviso', tipo: 'num', min: 1, max: 365 },
    { clave: 'presupuestoPct', etiqueta: 'Porcentaje de presupuesto', tipo: 'num', min: 1, max: 100 },
    { clave: 'nivelMinimo', etiqueta: 'Nivel mínimo', tipo: 'select', opciones: ['INFO', 'MEDIO', 'ALTO'].map((v) => ({ value: v, label: v })) },
    { clave: 'destinos', etiqueta: 'Destinos', tipo: 'multi', opciones: opcionesSiNo }
  ],
  flujos: [
    { clave: 'ventasRequierenAprobacion', etiqueta: 'Ventas requieren aprobación', tipo: 'bool' },
    { clave: 'comprasRequierenAprobacion', etiqueta: 'Compras requieren aprobación', tipo: 'bool' },
    { clave: 'anulacionRequiereMotivo', etiqueta: 'Anulación requiere motivo', tipo: 'bool' },
    { clave: 'autoAprobarHastaCent', etiqueta: 'Autoaprobar hasta (centavos)', tipo: 'num', min: 0, max: 100000000 },
    { clave: 'estadosOrden', etiqueta: 'Estados de orden', tipo: 'multi', opciones: ['RECIBIDA', 'EN_PROCESO', 'PENDIENTE_CLIENTE', 'FINALIZADA'].map((v) => ({ value: v, label: v.replaceAll('_', ' ') })) },
    { clave: 'cierreCajaAutomatico', etiqueta: 'Cierre automático de caja', tipo: 'bool', hint: 'Solo habilita la acción en la interfaz; el cierre sigue verificando permisos.' }
  ],
  widgets: [
    { clave: 'densidad', etiqueta: 'Densidad', tipo: 'select', opciones: [{ value: 'compacta', label: 'Compacta' }, { value: 'normal', label: 'Normal' }] },
    { clave: 'intervaloActualizacionSeg', etiqueta: 'Actualización cada (segundos)', tipo: 'num', min: 30, max: 3600 },
    { clave: 'filas', etiqueta: 'Filas por panel', tipo: 'num', min: 3, max: 50 },
    { clave: 'tamanoPagina', etiqueta: 'Filas por tabla', tipo: 'num', min: 5, max: 100 },
    { clave: 'buscadorGlobal', etiqueta: 'Buscador de módulos', tipo: 'bool' },
    { clave: 'filtrosAvanzados', etiqueta: 'Filtros por columna en tablas', tipo: 'bool' },
    { clave: 'columnasConfigurables', etiqueta: 'Permitir elegir columnas visibles', tipo: 'bool' },
    { clave: 'exportarCsv', etiqueta: 'Permitir exportar tablas a CSV', tipo: 'bool' },
    { clave: 'confirmarEliminacion', etiqueta: 'Confirmar eliminaciones', tipo: 'bool' }
  ],
  panel2026: [
    { clave: 'vista', etiqueta: 'Vista', tipo: 'select', opciones: ['OPERATIVA', 'FINANCIERA', 'RIESGO'].map((v) => ({ value: v, label: v })) },
    { clave: 'metricaPrincipal', etiqueta: 'Métrica principal', tipo: 'select', opciones: ['VENTAS', 'COBROS', 'CXC', 'STOCK'].map((v) => ({ value: v, label: v })) },
    { clave: 'diasProyeccion', etiqueta: 'Días de proyección', tipo: 'num', min: 7, max: 90 },
    { clave: 'umbralCxcDias', etiqueta: 'Umbral de CxC (días)', tipo: 'num', min: 1, max: 365 },
    { clave: 'umbralStockBajo', etiqueta: 'Umbral de stock bajo', tipo: 'num', min: 0, max: 100000 },
    { clave: 'filas', etiqueta: 'Filas del panel', tipo: 'num', min: 3, max: 50 },
    { clave: 'compararPeriodo', etiqueta: 'Comparar período anterior', tipo: 'bool' },
    { clave: 'mostrarAlertas', etiqueta: 'Mostrar alertas', tipo: 'bool' }
  ],
  rendimiento: [
    { clave: 'limiteFilas', etiqueta: 'Límite de filas', tipo: 'num', min: 10, max: 500 },
    { clave: 'cacheSegundos', etiqueta: 'Caché (segundos)', tipo: 'num', min: 0, max: 3600 },
    { clave: 'vacuumProgramado', etiqueta: 'VACUUM programado', tipo: 'select', opciones: ['DESACTIVADO', 'SEMANAL', 'MENSUAL'].map((v) => ({ value: v, label: v })) },
    { clave: 'modoBajoConsumo', etiqueta: 'Modo bajo consumo', tipo: 'bool' },
    { clave: 'lazyCargaModulos', etiqueta: 'Carga diferida de módulos', tipo: 'bool' }
  ],
  integraciones: [
    { clave: 'carpetaExportacion', etiqueta: 'Carpeta de exportación', tipo: 'text', hint: 'Nombre relativo bajo userData; sin rutas absolutas.' },
    { clave: 'formatos', etiqueta: 'Formatos permitidos', tipo: 'multi', opciones: ['CSV', 'XLSX', 'PDF'].map((v) => ({ value: v, label: v })) },
    { clave: 'impresoraTicket', etiqueta: 'Impresora de ticket', tipo: 'text' },
    { clave: 'exportacionAutomatica', etiqueta: 'Exportación automática', tipo: 'bool' }
  ],
  tema: [
    { clave: 'escala', etiqueta: 'Escala de interfaz', tipo: 'decimal', min: 0.8, max: 1.3, paso: 0.05 },
    { clave: 'radio', etiqueta: 'Radio de tarjetas', tipo: 'select', opciones: ['NINGUNO', 'SUAVE', 'REDONDO'].map((v) => ({ value: v, label: v })) },
    { clave: 'fuente', etiqueta: 'Fuente', tipo: 'select', opciones: ['SISTEMA', 'SANS', 'SERIF'].map((v) => ({ value: v, label: v })) },
    { clave: 'colorAcento', etiqueta: 'Color de acento', tipo: 'select', opciones: ['INDIGO', 'VERDE', 'AZUL', 'AMBAR'].map((v) => ({ value: v, label: v })) },
    { clave: 'reducirMovimiento', etiqueta: 'Reducir movimiento', tipo: 'bool' },
    { clave: 'altoContraste', etiqueta: 'Alto contraste', tipo: 'bool' }
  ],
  fiscal: [
    { clave: 'itbisPorDefecto', etiqueta: 'Código ITBIS por defecto', tipo: 'text' },
    { clave: 'monedaBase', etiqueta: 'Moneda base', tipo: 'select', opciones: ['DOP', 'USD', 'EUR'].map((v) => ({ value: v, label: v })) },
    { clave: 'redondeo', etiqueta: 'Redondeo', tipo: 'select', opciones: [{ value: 'BANCARIO', label: 'Bancario (fijo)' }] },
    { clave: 'ncfAvisoDias', etiqueta: 'Aviso NCF (días)', tipo: 'num', min: 1, max: 90 },
    { clave: 'libro606', etiqueta: 'Libro 606', tipo: 'bool' },
    { clave: 'libro607', etiqueta: 'Libro 607', tipo: 'bool' },
    { clave: 'formatoComprobante', etiqueta: 'Formato de comprobante', tipo: 'select', opciones: [{ value: 'NCF', label: 'NCF' }, { value: 'PREPARACION_E_CF', label: 'Preparación para e-CF' }] }
  ],
  notificaciones: [
    { clave: 'sonido', etiqueta: 'Sonido', tipo: 'bool' },
    { clave: 'duracionToastMs', etiqueta: 'Duración del aviso (ms)', tipo: 'num', min: 1000, max: 10000 },
    { clave: 'eventos', etiqueta: 'Eventos avisados', tipo: 'multi', opciones: opcionesEventos }
  ],
  seguridad: [
    { clave: 'ocultarCostosEnListados', etiqueta: 'Ocultar costos en listados', tipo: 'bool' },
    { clave: 'confirmarAnulaciones', etiqueta: 'Confirmar anulaciones', tipo: 'bool' },
    { clave: 'mascararRnc', etiqueta: 'Enmascarar RNC/cédula', tipo: 'bool' },
    { clave: 'avisoAntesDeBloqueoMin', etiqueta: 'Aviso antes de bloqueo (min)', tipo: 'num', min: 1, max: 30 }
  ],
  featureFlags: [],
  interfaz: [
    { clave: 'tituloApp', etiqueta: 'Título de la aplicación', tipo: 'text' },
    { clave: 'anchoSidebar', etiqueta: 'Ancho del menú (px)', tipo: 'num', min: 200, max: 360 },
    { clave: 'densidadTablas', etiqueta: 'Densidad de tablas', tipo: 'select', opciones: [{ value: 'compacta', label: 'Compacta' }, { value: 'normal', label: 'Normal' }] },
    { clave: 'mostrarIconos', etiqueta: 'Mostrar iconos en el menú', tipo: 'bool' },
    { clave: 'ocultarElementos', etiqueta: 'Elementos ocultos', tipo: 'multi', opciones: [
      { value: 'buscadorModulos', label: 'Buscador de módulos' },
      { value: 'barraEstado', label: 'Barra de estado' },
      { value: 'distintivoFase', label: 'Distintivo de fase' },
      { value: 'avatarUsuario', label: 'Avatar del usuario' },
      { value: 'botonTema', label: 'Botón de tema' },
      { value: 'botonActualizaciones', label: 'Botón Actualizaciones' },
      { value: 'botonAcerca', label: 'Botón Acerca de' }
    ] },
    { clave: 'piePersonalizado', etiqueta: 'Pie personalizado', tipo: 'text' }
  ]
}

const etiquetasWidget: Record<WidgetId, string> = {
  'kpi-ventas': 'Ventas', 'kpi-compras': 'Compras', 'kpi-utilidad': 'Utilidad',
  'kpi-margen': 'Margen', 'kpi-cobros': 'Cobros', 'kpi-pagos': 'Pagos',
  'kpi-cxc': 'CxC', 'kpi-cxp': 'CxP', 'tendencia': 'Tendencia mensual',
  'formas-pago': 'Formas de pago', 'top-clientes': 'Principales clientes',
  'top-productos': 'Productos facturados', 'alertas': 'Alertas'
}

const protegidos = new Set<string>(modulosProtegidos)

/** Genera una clave `custom.*` legible a partir de la etiqueta. */
function claveDesdeLabel(label: string): string {
  const base = normalizarTexto(label)
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return `custom.${base || 'permiso'}`
}

const permisosExtra: Partial<Record<AjustesGrupo, string>> = {
  seguridad: 'configuracion.ajustes.seguridad.modificar',
  integraciones: 'configuracion.ajustes.integraciones.modificar',
  featureFlags: 'configuracion.ajustes.featureFlags.modificar',
  interfaz: 'configuracion.ajustes.interfaz.modificar'
}

/** Centro de control: permisos editables con descripción y ajustes operativos auditados. */
export function CentroControlPage(): React.JSX.Element {
  const refrescarSesion = useSessionStore((s) => s.refresh)
  const [tab, setTab] = useState('permisos')
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [catalogo, setCatalogo] = useState<PermissionDef[]>([])
  const [rolId, setRolId] = useState<number | ''>('')
  const [detalle, setDetalle] = useState<RoleDetail | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const [confirmarCriticos, setConfirmarCriticos] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardandoPermisos, setGuardandoPermisos] = useState(false)
  const [permisoForm, setPermisoForm] = useState<PermisoPersonalizadoForm | null>(null)
  const [guardandoPermiso, setGuardandoPermiso] = useState(false)

  const [ajustes, setAjustes] = useState<Ajustes>(() => ajustesConDefaults(useAjustesStore.getState().ajustes))
  const [cambios, setCambios] = useState<Set<AjustesGrupo>>(new Set())
  const [grupo, setGrupo] = useState<AjustesGrupo>('alertas')
  const [guardandoAjustes, setGuardandoAjustes] = useState(false)
  const [capas, setCapas] = useState<CapaAjuste[]>([])
  const [capaForm, setCapaForm] = useState<CapaForm | null>(null)
  const [guardandoCapa, setGuardandoCapa] = useState(false)

  const puedeVerPermisos = can('seguridad.consultar')
  const puedeEditarPermisos = can('seguridad.permiso.modificar')
  const puedeVerAjustes = can('configuracion.ajustes.consultar')
  const puedeEditarAjustes = can('configuracion.ajustes.modificar')

  const abrirRol = useCallback(async (id: number) => {
    try {
      const d = await window.api.invoke<RoleDetail>('seguridad.roles.permissions.get', id)
      setDetalle(d)
      setSeleccion(new Set(d.permisos.map((p) => p.key)))
      setConfirmarCriticos(false)
      setMotivo('')
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [])

  const cargarPermisos = useCallback(async () => {
    if (!can('seguridad.consultar')) return
    try {
      const [r, p] = await Promise.all([
        window.api.invoke<RoleRow[]>('seguridad.roles.list'),
        window.api.invoke<PermissionDef[]>('seguridad.permissions.catalog')
      ])
      setRoles(r)
      setCatalogo(p)
      const editable = r.find((x) => x.nombre !== 'Administrador')
      if (editable && !rolId) {
        setRolId(editable.id)
        void abrirRol(editable.id)
      }
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [rolId, abrirRol])

  const cargarAjustes = useCallback(async () => {
    if (!can('configuracion.ajustes.consultar')) return
    await useAjustesStore.getState().recargar()
    setAjustes(ajustesConDefaults(useAjustesStore.getState().ajustes))
    setCambios(new Set())
  }, [])

  const cargarCapas = useCallback(async () => {
    if (!can('configuracion.ajustes.consultar')) return
    try {
      setCapas(await window.api.invoke<CapaAjuste[]>('config.ajustes.personalizados.list', {}))
    } catch (e) { toast.error(errorInfo(e).message) }
  }, [])

  useEffect(() => {
    void cargarPermisos()
    void cargarAjustes()
    void cargarCapas()
  }, [cargarPermisos, cargarAjustes, cargarCapas])

  const gruposPermisos = useMemo(() => {
    const map = new Map<ModuleKey, PermissionDef[]>()
    for (const p of catalogo) {
      if (!coincideTexto(`${p.label} ${p.descripcion} ${p.key}`, busqueda)) continue
      map.set(p.module, [...(map.get(p.module) ?? []), p])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [catalogo, busqueda])

  function alternarPermiso(key: string, checked: boolean): void {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function guardarPermisos(): Promise<void> {
    if (!detalle || detalle.bloqueado || rolId === '') return
    setGuardandoPermisos(true)
    try {
      await window.api.invoke('seguridad.roles.permissions.replace', {
        rolId, permisos: [...seleccion], confirmarCriticos, motivo
      })
      toast.success('Permisos actualizados, auditados y aplicados a nuevas sesiones.')
      await abrirRol(rolId)
      await cargarPermisos()
      await refrescarSesion()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setGuardandoPermisos(false) }
  }

  async function guardarPermisoPersonalizado(): Promise<void> {
    if (!permisoForm) return
    setGuardandoPermiso(true)
    try {
      await window.api.invoke('seguridad.permissions.custom.save', permisoForm)
      toast.success('Permiso personalizado guardado y auditado.')
      setPermisoForm(null)
      await cargarPermisos()
      if (rolId !== '') await abrirRol(rolId)
      await refrescarSesion()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setGuardandoPermiso(false) }
  }

  async function eliminarPermisoPersonalizado(key: string): Promise<void> {
    if (!window.confirm(`¿Eliminar el permiso personalizado ${key}? Se retirará de todos los roles.`)) return
    try {
      await window.api.invoke('seguridad.permissions.custom.delete', { key })
      toast.success('Permiso personalizado eliminado.')
      await cargarPermisos()
      if (rolId !== '') await abrirRol(rolId)
      await refrescarSesion()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  function etiquetaObjetivo(ambito: AjustesAmbito, objetivo: string): string {
    if (ambito === 'ROL') {
      return roles.find((r) => String(r.id) === objetivo)?.nombre ?? `Rol ${objetivo}`
    }
    return catalogo.find((p) => p.key === objetivo)?.label ?? objetivo
  }

  function cambiarDatoCapa(clave: string, valor: unknown): void {
    setCapaForm((prev) => prev ? { ...prev, datos: { ...prev.datos, [clave]: valor } } : prev)
  }

  function abrirCapa(capa?: CapaAjuste): void {
    if (!capa) {
      const grupo = 'interfaz' as const
      setCapaForm({
        ambito: 'ROL', objetivo: String(roles[0]?.id ?? ''), grupo, editando: false,
        datos: { ...defaultAjustes[grupo] } as Record<string, unknown>
      })
      return
    }
    let datos: Record<string, unknown> = {}
    try { datos = JSON.parse(capa.datos_json) as Record<string, unknown> } catch { datos = {} }
    setCapaForm({
      ambito: capa.ambito, objetivo: capa.objetivo,
      grupo: capa.grupo as CapaForm['grupo'], datos, editando: true
    })
  }

  async function guardarCapa(): Promise<void> {
    if (!capaForm) return
    setGuardandoCapa(true)
    try {
      await window.api.invoke('config.ajustes.personalizados.save', capaForm)
      toast.success('Capa personalizada guardada, validada y auditada.')
      setCapaForm(null)
      await cargarCapas()
      await useAjustesStore.getState().recargar()
      await refrescarSesion()
    } catch (e) { toast.error(errorInfo(e).message) } finally { setGuardandoCapa(false) }
  }

  async function eliminarCapa(capa: CapaAjuste): Promise<void> {
    if (!window.confirm(`¿Eliminar la capa ${capa.ambito}:${etiquetaObjetivo(capa.ambito, capa.objetivo)}/${capa.grupo}?`)) return
    try {
      await window.api.invoke('config.ajustes.personalizados.delete', {
        ambito: capa.ambito, objetivo: capa.objetivo, grupo: capa.grupo
      })
      toast.success('Capa eliminada y auditada.')
      await cargarCapas()
      await useAjustesStore.getState().recargar()
      await refrescarSesion()
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  function cambiar(g: AjustesGrupo, clave: string, valor: unknown): void {
    setAjustes((prev) => ({
      ...prev,
      [g]: { ...(prev[g] as Record<string, unknown>), [clave]: valor }
    }) as Ajustes)
    setCambios((prev) => new Set(prev).add(g))
  }

  function valor(g: AjustesGrupo, clave: string): unknown {
    return (ajustes[g] as Record<string, unknown>)[clave]
  }

  async function guardarAjustes(): Promise<void> {
    const gruposCambiados = ajustesGrupos.filter((g) => cambios.has(g))
    if (gruposCambiados.length === 0) { toast.info('No hay cambios pendientes.'); return }
    setGuardandoAjustes(true)
    try {
      const resultados = await Promise.allSettled(
        gruposCambiados.map((g) => window.api.invoke('config.ajustes.save', { grupo: g, datos: ajustes[g] }))
      )
      const fallidos = gruposCambiados.filter((_, i) => resultados[i].status === 'rejected')
      const guardados = gruposCambiados.length - fallidos.length
      await cargarAjustes()
      aplicarTemaAvanzado(useAjustesStore.getState().ajustes.tema ?? defaultAjustes.tema)
      if (fallidos.length === 0) {
        toast.success(`${guardados} grupo(s) guardados y auditados.`)
      } else {
        const razon = resultados[gruposCambiados.indexOf(fallidos[0])]
        toast.error(
          `Guardados ${guardados} de ${gruposCambiados.length}. Fallaron: ${fallidos.join(', ')}. ` +
          (razon.status === 'rejected' ? errorInfo(razon.reason).message : '')
        )
      }
    } finally { setGuardandoAjustes(false) }
  }

  async function aplicarPlantilla(plantilla: typeof plantillasInterfaz[number]): Promise<void> {
    if (!puedeEditarAjustes) return
    const tema = plantilla.cambios.tema ?? defaultAjustes.tema
    const widgets = {
      ...defaultAjustes.widgets, ...ajustes.widgets, ...plantilla.cambios.widgets,
      widgets: ajustes.widgets.widgets
    }
    const interfaz = {
      ...defaultAjustes.interfaz, ...ajustes.interfaz, ...plantilla.cambios.interfaz,
      // El orden y las etiquetas del menú son decisiones del administrador: no se sobreescriben.
      etiquetasModulo: ajustes.interfaz.etiquetasModulo,
      ordenGrupos: ajustes.interfaz.ordenGrupos
    }
    try {
      await Promise.all([
        window.api.invoke('config.ajustes.save', { grupo: 'tema', datos: tema }),
        window.api.invoke('config.ajustes.save', { grupo: 'widgets', datos: widgets }),
        window.api.invoke('config.ajustes.save', { grupo: 'interfaz', datos: interfaz })
      ])
      await cargarAjustes()
      aplicarTemaAvanzado(useAjustesStore.getState().ajustes.tema ?? defaultAjustes.tema)
      setAjustes(ajustesConDefaults(useAjustesStore.getState().ajustes))
      setCambios(new Set())
      toast.success(`Plantilla «${plantilla.label}» aplicada y auditada.`)
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  async function restaurarGrupo(): Promise<void> {
    try {
      await window.api.invoke('config.ajustes.reset', { grupo })
      await cargarAjustes()
      if (grupo === 'tema') aplicarTemaAvanzado(defaultAjustes.tema)
      toast.success('Grupo restaurado a sus valores por defecto.')
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  function controlCampo(
    g: AjustesGrupo, campo: Campo,
    opts?: {
      valor: (clave: string) => unknown
      cambiar: (clave: string, valor: unknown) => void
      bloqueado?: boolean
    }
  ): React.JSX.Element {
    const bloqueado = opts?.bloqueado ?? (!puedeEditarAjustes || (permisosExtra[g] ? !can(permisosExtra[g]!) : false))
    const valorActual = opts ? opts.valor(campo.clave) : valor(g, campo.clave)
    const setValor = (v: unknown): void => opts ? opts.cambiar(campo.clave, v) : cambiar(g, campo.clave, v)
    if (campo.tipo === 'bool') {
      return (
        <label key={campo.clave} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          <input
            type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600"
            checked={Boolean(valorActual)} disabled={bloqueado}
            onChange={(e) => setValor(e.target.checked)}
          />
          <span><span className="block font-medium">{campo.etiqueta}</span>{campo.hint && <span className="block text-[11px] text-slate-400">{campo.hint}</span>}</span>
        </label>
      )
    }
    if (campo.tipo === 'select') {
      return (
        <Field key={campo.clave} label={campo.etiqueta} hint={campo.hint}>
          <select className={inputClass} value={String(valorActual ?? '')} disabled={bloqueado}
            onChange={(e) => setValor(e.target.value)}>
            {campo.opciones?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )
    }
    if (campo.tipo === 'multi') {
      const seleccionados = Array.isArray(valorActual) ? valorActual as string[] : []
      return (
        <Field key={campo.clave} label={campo.etiqueta} hint={campo.hint}>
          <div className="flex flex-wrap gap-2">
            {campo.opciones?.map((o) => (
              <label key={o.value} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${seleccionados.includes(o.value) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>
                <input type="checkbox" className="sr-only" checked={seleccionados.includes(o.value)} disabled={bloqueado}
                  onChange={(e) => setValor(e.target.checked
                    ? [...seleccionados, o.value]
                    : seleccionados.filter((v) => v !== o.value))} />
                {o.label}
              </label>
            ))}
          </div>
        </Field>
      )
    }
    return (
      <Field key={campo.clave} label={campo.etiqueta} hint={campo.hint}>
        {campo.tipo === 'num' || campo.tipo === 'decimal' ? (
          <NumberInput
            label={campo.etiqueta}
            value={Number(valorActual ?? 0)}
            min={campo.min ?? 0} max={campo.max ?? Number.MAX_SAFE_INTEGER}
            decimal={campo.tipo === 'decimal'}
            disabled={bloqueado}
            onChange={(v) => setValor(v)}
          />
        ) : (
          <TextInput
            type="text"
            value={String(valorActual ?? '')}
            disabled={bloqueado}
            onChange={(e) => setValor(e.target.value)}
          />
        )}
      </Field>
    )
  }

  const bloqueadoGrupo = (g: AjustesGrupo): boolean =>
    !puedeEditarAjustes || (permisosExtra[g] ? !can(permisosExtra[g]!) : false)

  function editorWidgets(): React.JSX.Element {
    const lista = [...ajustes.widgets.widgets].sort((a, b) => a.orden - b.orden)
    return (
      <Card title="Widgets del panel ejecutivo" subtitle="Solo se ocultan tarjetas; la autorización sigue en el backend.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr><th className="py-2 text-left">Widget</th><th className="py-2 text-left">Visible</th><th className="py-2 text-left">Orden</th><th className="py-2 text-left">Ancho</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((w) => (
                <tr key={w.id}>
                  <td className="py-2">{etiquetasWidget[w.id]}</td>
                  <td className="py-2">
                    <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={w.visible} disabled={bloqueadoGrupo('widgets')}
                      onChange={(e) => cambiar('widgets', 'widgets', lista.map((x) => x.id === w.id ? { ...x, visible: e.target.checked } : x))} />
                  </td>
                  <td className="py-2">
                    <NumberInput label={`Orden de ${etiquetasWidget[w.id]}`} value={w.orden} min={0} max={99}
                      disabled={bloqueadoGrupo('widgets')}
                      onChange={(orden) => cambiar('widgets', 'widgets', lista.map((x) => x.id === w.id ? { ...x, orden } : x))} />
                  </td>
                  <td className="py-2">
                    <select className={inputClass} value={w.ancho} disabled={bloqueadoGrupo('widgets')}
                      onChange={(e) => cambiar('widgets', 'widgets', lista.map((x) => x.id === w.id ? { ...x, ancho: e.target.value as typeof x.ancho } : x))}>
                      <option value="TERCIO">Tercio</option><option value="MEDIO">Medio</option><option value="COMPLETO">Completo</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">Los identificadores son fijos: no se aceptan componentes ni rutas desde el renderer.</p>
      </Card>
    )
  }

  function alternarModulo(modulo: string, activo: boolean): void {
    const actual = ajustes.featureFlags.modulos
    const existe = actual.some((m) => m.modulo === modulo)
    const siguiente = existe
      ? actual.map((m) => m.modulo === modulo ? { ...m, activo } : m)
      : [...actual, { modulo: modulo as typeof actual[number]['modulo'], activo }]
    cambiar('featureFlags', 'modulos', siguiente)
  }

  function editorModulos(): React.JSX.Element {
    return (
      <Card title="Módulos visibles" subtitle="Ocultar un módulo no elimina datos ni cambia permisos.">
        <div className="grid gap-2 md:grid-cols-2">
          {modules.map((modulo) => {
            const flag = ajustes.featureFlags.modulos.find((m) => m.modulo === modulo)
            const protegido = protegidos.has(modulo)
            return (
              <label key={modulo} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${protegido ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={flag?.activo ?? true}
                  disabled={protegido || bloqueadoGrupo('featureFlags')}
                  onChange={(e) => alternarModulo(modulo, e.target.checked)} />
                <span className="flex-1">{moduleLabels[modulo]}</span>
                {protegido && <Badge tone="accent">Protegido</Badge>}
              </label>
            )
          })}
        </div>
      </Card>
    )
  }

  function moverGrupo(id: (typeof ajustes.interfaz.ordenGrupos)[number], paso: -1 | 1): void {
    const orden = [...ajustes.interfaz.ordenGrupos]
    const i = orden.indexOf(id)
    const j = i + paso
    if (i < 0 || j < 0 || j >= orden.length) return
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
    cambiar('interfaz', 'ordenGrupos', orden)
  }

  function editorInterfaz(): React.JSX.Element {
    const orden = ajustes.interfaz.ordenGrupos
    const etiquetas = ajustes.interfaz.etiquetasModulo
    const bloqueado = bloqueadoGrupo('interfaz')
    return (
      <>
        <Card title="Orden de los grupos del menú" subtitle="Use las flechas para reorganizar la navegación sin tocar permisos ni rutas.">
          <div className="space-y-1">
            {orden.map((id, i) => (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span className="w-6 text-xs text-slate-400">{i + 1}</span>
                <span className="flex-1">{moduleLabels[id as ModuleKey] ?? id}</span>
                <button type="button" disabled={i === 0 || bloqueado} onClick={() => moverGrupo(id, -1)}
                  className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label={`Subir ${id}`}>↑</button>
                <button type="button" disabled={i === orden.length - 1 || bloqueado} onClick={() => moverGrupo(id, 1)}
                  className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label={`Bajar ${id}`}>↓</button>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Renombrar módulos" subtitle="El cambio es solo visual: las claves de permiso y las rutas no se modifican.">
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              {Object.keys(etiquetas).length} módulo(s) renombrados · ver los {vistasPersonalizables.length} módulos
            </summary>
            <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-3">
              {vistasPersonalizables.map((vista) => (
                <Field key={vista} label={vista}>
                  <TextInput
                    value={etiquetas[vista] ?? ''}
                    placeholder="Nombre por defecto"
                    disabled={bloqueado}
                    onChange={(e) => {
                      const next = { ...etiquetas }
                      if (e.target.value.trim()) next[vista] = e.target.value
                      else delete next[vista]
                      cambiar('interfaz', 'etiquetasModulo', next)
                    }}
                  />
                </Field>
              ))}
            </div>
          </details>
        </Card>
      </>
    )
  }

  function editorGrupo(): React.JSX.Element {
    const def = grupos.find((g) => g.id === grupo)!
    return (
      <div className="space-y-4">
        <Card title={def.label} subtitle={def.descripcion}>
          {bloqueadoGrupo(grupo) && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              Su perfil puede consultar estos ajustes pero no modificarlos.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {campos[grupo].map((campo) => controlCampo(grupo, campo))}
          </div>
        </Card>
        {grupo === 'widgets' && editorWidgets()}
        {grupo === 'featureFlags' && editorModulos()}
        {grupo === 'interfaz' && editorInterfaz()}
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Centro de control administrativo"
        subtitle="Permisos con descripción, ajustes por empresa, paneles configurables y módulos. Cada cambio se valida y audita en backend."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { void cargarPermisos(); void cargarAjustes(); void cargarCapas() }}>
              <RotateCcw size={14} /> Recargar
            </Button>
            <Button size="sm" onClick={() => void guardarAjustes()} disabled={guardandoAjustes || cambios.size === 0}>
              <Save size={14} /> {guardandoAjustes ? 'Guardando…' : `Guardar ajustes${cambios.size ? ` (${cambios.size})` : ''}`}
            </Button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'permisos', label: 'Permisos' },
          { id: 'interfaz', label: 'Interfaz' },
          { id: 'ajustes', label: 'Ajustes avanzados' },
          { id: 'personalizacion', label: 'Por rol / permiso' },
          { id: 'paneles', label: 'Paneles' },
          { id: 'modulos', label: 'Módulos' }
        ]}
        active={tab}
        onChange={(id) => {
          if (id === 'interfaz') setGrupo('interfaz')
          setTab(id)
        }}
      />

      {tab === 'permisos' && (
        <TabPanel>
          {!puedeVerPermisos ? (
            <Card title="Acceso limitado"><p className="text-sm text-slate-500">Necesita `seguridad.consultar` para revisar permisos.</p></Card>
          ) : (
            <div className="space-y-4">
              <Card
                title="Editor de permisos por rol"
                subtitle="Cada permiso indica para qué sirve. Los cambios rigen de inmediato en backend."
                actions={puedeEditarPermisos ? (
                  <Button size="sm" onClick={() => setPermisoForm({
                    key: '', label: '', descripcion: '', module: 'configuracion', critico: false
                  })}><KeyRound size={14} /> Crear permiso</Button>
                ) : undefined}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Rol">
                    <select className={inputClass} value={rolId}
                      onChange={(e) => { const id = Number(e.target.value); setRolId(id); void abrirRol(id) }}>
                      <option value="">Seleccione…</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </Field>
                  <Field label="Buscar permiso">
                    <div className="relative">
                      <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
                      <TextInput className="pl-7" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, clave o descripción" />
                    </div>
                  </Field>
                  {detalle?.bloqueado && <Badge tone="accent"><ShieldCheck size={11} /> Rol del sistema</Badge>}
                  {detalle && !detalle.bloqueado && <Badge>{seleccion.size} permisos</Badge>}
                </div>
              </Card>

              {detalle && !detalle.bloqueado && (
                <Card title="Confirmación" subtitle="Los permisos críticos requieren confirmación explícita y se auditan con su motivo.">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={confirmarCriticos} disabled={!puedeEditarPermisos}
                        onChange={(e) => setConfirmarCriticos(e.target.checked)} />
                      Confirmo cambios en permisos críticos
                    </label>
                    <Field label="Motivo del cambio (opcional)">
                      <TextInput value={motivo} maxLength={200} disabled={!puedeEditarPermisos} onChange={(e) => setMotivo(e.target.value)} />
                    </Field>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" onClick={() => void guardarPermisos()} disabled={!puedeEditarPermisos || guardandoPermisos}>
                      <Save size={14} /> {guardandoPermisos ? 'Guardando…' : 'Guardar permisos del rol'}
                    </Button>
                  </div>
                </Card>
              )}

              {detalle?.bloqueado ? (
                <Card title="Administrador"><p className="text-sm text-slate-500">El rol Administrador conserva todos los permisos y no se puede editar.</p></Card>
              ) : (
                <div className="space-y-3">
                  {gruposPermisos.map(([modulo, permisos]) => (
                    <Card key={modulo} title={moduleLabels[modulo]} subtitle={`${permisos.length} permisos`}>
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr><th className="py-2 w-10"></th><th className="py-2">Permiso</th><th className="py-2">Para qué sirve</th><th className="py-2">Clave</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {permisos.map((p) => (
                            <tr key={p.key}>
                              <td className="py-2">
                                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={seleccion.has(p.key)}
                                  disabled={!puedeEditarPermisos || !detalle}
                                  onChange={(e) => alternarPermiso(p.key, e.target.checked)} />
                              </td>
                              <td className="py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{p.label}</span>
                                  {p.critico && <Badge tone="danger">Crítico</Badge>}
                                </div>
                              </td>
                              <td className="py-2 text-xs text-slate-500 dark:text-slate-400">{p.descripcion}</td>
                              <td className="py-2 font-mono text-[11px] text-slate-400">{p.key}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  ))}
                </div>
              )}

              <Card
                title="Permisos personalizados"
                subtitle="Etiquetas creadas por el administrador, con descripción y auditoría. Pueden asignarse a roles; no sustituyen las verificaciones del backend."
              >
                <DataTable
                  columns={[
                    { key: 'label', header: 'Permiso', value: (p) => p.label },
                    { key: 'descripcion', header: 'Para qué sirve', value: (p) => p.descripcion },
                    { key: 'modulo', header: 'Módulo', value: (p) => moduleLabels[p.module] ?? p.module },
                    { key: 'key', header: 'Clave', value: (p) => p.key },
                    { key: 'critico', header: 'Criticidad', render: (p) => p.critico ? <Badge tone="danger">Crítico</Badge> : <Badge>Normal</Badge> }
                  ] as Column<PermissionDef>[]}
                  data={catalogo.filter((p) => p.personalizado)}
                  rowKey={(p) => p.key}
                  storageKey="permisos-personalizados"
                  pageSize={6}
                  emptyText="No hay permisos personalizados. Use «Crear permiso»."
                  actions={(p) => puedeEditarPermisos ? (
                    <div className="flex justify-end gap-1">
                      <button
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Editar"
                        onClick={() => setPermisoForm({
                          key: p.key, label: p.label, descripcion: p.descripcion, module: p.module, critico: p.critico
                        })}
                      ><Pencil size={14} /></button>
                      <button
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Eliminar"
                        onClick={() => void eliminarPermisoPersonalizado(p.key)}
                      ><Trash2 size={14} /></button>
                    </div>
                  ) : undefined}
                />
              </Card>
            </div>
          )}
        </TabPanel>
      )}

      {tab === 'personalizacion' && (
        <TabPanel>
          {!puedeVerAjustes ? (
            <Card title="Acceso limitado"><p className="text-sm text-slate-500">Necesita `configuracion.ajustes.consultar`.</p></Card>
          ) : (
            <div className="space-y-4">
              <Card
                title="Personalización por rol o permiso"
                subtitle="Solo se permiten los grupos visuales (tema, paneles, módulos e interfaz). Las capas se validan y auditan en backend; nunca habilitan rutas."
                actions={puedeEditarAjustes && puedeVerPermisos ? (
                  <Button size="sm" onClick={() => abrirCapa()}><Plus size={14} /> Nueva capa</Button>
                ) : undefined}
              >
                <p className="text-xs text-slate-500">
                  Prioridad: valores de empresa → capa de rol → capa de permiso. Si un usuario tiene varios roles, se aplican en orden de id.
                </p>
              </Card>
              <Card title="Capas guardadas" subtitle="Se aplican automáticamente al iniciar sesión el usuario correspondiente.">
                <DataTable<CapaAjuste>
                  columns={[
                    { key: 'ambito', header: 'Ámbito', render: (c) => <Badge tone={c.ambito === 'ROL' ? 'accent' : 'neutral'}>{c.ambito}</Badge> },
                    { key: 'objetivo', header: 'Rol o permiso', value: (c) => etiquetaObjetivo(c.ambito, c.objetivo) },
                    { key: 'grupo', header: 'Grupo', value: (c) => grupos.find((g) => g.id === c.grupo)?.label ?? c.grupo },
                    { key: 'actualizado_en', header: 'Actualizado', value: (c) => c.actualizado_en },
                    { key: 'clave', header: 'Clave', value: (c) => `${c.ambito}:${c.objetivo}:${c.grupo}` }
                  ]}
                  data={capas}
                  rowKey={(c) => `${c.ambito}:${c.objetivo}:${c.grupo}`}
                  storageKey="capas-personalizacion"
                  pageSize={8}
                  emptyText="Sin capas personalizadas. Use «Nueva capa»."
                  actions={(c) => (
                    <div className="flex justify-end gap-1">
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Editar capa"
                        onClick={() => abrirCapa(c)}><Pencil size={14} /></button>
                      {can('configuracion.ajustes.restaurar') && (
                        <button className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Eliminar capa"
                          onClick={() => void eliminarCapa(c)}><Trash2 size={14} /></button>
                      )}
                    </div>
                  )}
                />
              </Card>
            </div>
          )}
        </TabPanel>
      )}

      {(tab === 'ajustes' || tab === 'interfaz') && (
        <TabPanel>
          {!puedeVerAjustes ? (
            <Card title="Acceso limitado"><p className="text-sm text-slate-500">Necesita `configuracion.ajustes.consultar`.</p></Card>
          ) : (
            <div className="space-y-4">
              {tab === 'interfaz' && (
                <Card title="Plantillas rápidas" subtitle="Aplican tema, paneles y menú a la vez. Cada grupo se guarda y audita por separado; no tocan permisos ni políticas duras.">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {plantillasInterfaz.map((plantilla) => (
                      <button
                        key={plantilla.id}
                        onClick={() => void aplicarPlantilla(plantilla)}
                        disabled={!puedeEditarAjustes}
                        className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
                      >
                        <span className="block text-sm font-medium">{plantilla.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{plantilla.descripcion}</span>
                      </button>
                    ))}
                  </div>
                  {!puedeEditarAjustes && <p className="mt-2 text-xs text-amber-600">Necesita `configuracion.ajustes.modificar`.</p>}
                </Card>
              )}
              <div className="flex flex-wrap gap-2">
                {grupos.map((g) => (
                  <Button key={g.id} size="sm" variant={grupo === g.id ? 'primary' : 'secondary'} onClick={() => { setGrupo(g.id); setTab('ajustes') }}>
                    {g.label}{cambios.has(g.id) && <span className="ml-1 text-xs">•</span>}
                  </Button>
                ))}
              </div>
              {editorGrupo()}
              {cambios.has(grupo) && (
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => void restaurarGrupo()} disabled={!can('configuracion.ajustes.restaurar') || bloqueadoGrupo(grupo)}>
                    <RotateCcw size={14} /> Restaurar grupo
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabPanel>
      )}

      {tab === 'paneles' && (
        <TabPanel>
          {!puedeVerAjustes ? (
            <Card title="Acceso limitado"><p className="text-sm text-slate-500">Necesita permisos de configuración.</p></Card>
          ) : (
            <div className="space-y-4">
              <Card title="Paneles configurables" subtitle="El panel ejecutivo respeta visibilidad, orden, densidad e intervalo de actualización.">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <SlidersHorizontal size={15} /> Los widgets se ordenan automáticamente en la vista de panel ejecutivo.
                </p>
              </Card>
              {editorWidgets()}
              <Card title="Otros parámetros del panel">
                <div className="grid gap-4 md:grid-cols-3">{campos.widgets.map((campo) => controlCampo('widgets', campo))}</div>
              </Card>
            </div>
          )}
        </TabPanel>
      )}

      {tab === 'modulos' && (
        <TabPanel>
          {!puedeVerAjustes ? (
            <Card title="Acceso limitado"><p className="text-sm text-slate-500">Necesita permisos de configuración.</p></Card>
          ) : editorModulos()}
        </TabPanel>
      )}

      <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <Check size={13} /> Políticas duras (sesión, IPC, permisos, transacciones e integridad) no se pueden relajar desde esta pantalla.
      </p>

      <Modal
        open={!!permisoForm}
        title={permisoForm && catalogo.some((p) => p.key === permisoForm.key) ? 'Editar permiso personalizado' : 'Crear permiso personalizado'}
        subtitle="Se guarda en SQLite, se audita y puede asignarse a cualquier rol. No habilita rutas del sistema por sí solo."
        onClose={() => setPermisoForm(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setPermisoForm(null)}>Cancelar</Button>
          <Button
            onClick={() => void guardarPermisoPersonalizado()}
            disabled={guardandoPermiso || !permisoForm || !/^custom\.[a-z0-9_]{3,40}$/.test(permisoForm.key) ||
              permisoForm.label.trim().length < 3 || permisoForm.descripcion.trim().length < 10}
          >{guardandoPermiso ? 'Guardando…' : 'Guardar permiso'}</Button>
        </>}
      >
        {permisoForm && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre visible" hint="Se muestra en el editor de roles.">
              <TextInput
                value={permisoForm.label}
                onChange={(e) => {
                  const label = e.target.value
                  setPermisoForm((prev) => prev ? {
                    ...prev,
                    label,
                    key: !prev.key || prev.key === claveDesdeLabel(prev.label) ? claveDesdeLabel(label) : prev.key
                  } : prev)
                }}
              />
            </Field>
            <Field label="Clave" hint="Debe empezar por custom. y usar minúsculas, números o guion bajo.">
              <TextInput
                className="font-mono text-xs"
                value={permisoForm.key}
                disabled={catalogo.some((p) => p.key === permisoForm.key)}
                onChange={(e) => setPermisoForm({ ...permisoForm, key: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Módulo" className="sm:col-span-2">
              <select className={inputClass} value={permisoForm.module}
                onChange={(e) => setPermisoForm({ ...permisoForm, module: e.target.value as ModuleKey })}>
                {modules.map((modulo) => <option key={modulo} value={modulo}>{moduleLabels[modulo]}</option>)}
              </select>
            </Field>
            <Field label="Para qué sirve" className="sm:col-span-2" hint="Explique el uso concreto: así otro administrador sabrá cuándo concederlo.">
              <TextInput
                value={permisoForm.descripcion}
                maxLength={300}
                onChange={(e) => setPermisoForm({ ...permisoForm, descripcion: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={permisoForm.critico}
                onChange={(e) => setPermisoForm({ ...permisoForm, critico: e.target.checked })} />
              Requiere confirmación explícita al concederlo
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={!!capaForm}
        title={capaForm?.editando ? 'Editar capa de personalización' : 'Nueva capa de personalización'}
        subtitle="Solo grupos visuales. La capa se valida con Zod y se audita antes de aplicarse."
        width="max-w-3xl"
        onClose={() => setCapaForm(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setCapaForm(null)}>Cancelar</Button>
          <Button onClick={() => void guardarCapa()} disabled={guardandoCapa || !puedeEditarAjustes || !capaForm?.objetivo}>
            {guardandoCapa ? 'Guardando…' : 'Guardar capa'}
          </Button>
        </>}
      >
        {capaForm && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Ámbito">
                <select className={inputClass} value={capaForm.ambito} disabled={capaForm.editando}
                  onChange={(e) => {
                    const ambito = e.target.value as AjustesAmbito
                    setCapaForm({
                      ...capaForm, ambito,
                      objetivo: ambito === 'ROL' ? String(roles[0]?.id ?? '') : (catalogo[0]?.key ?? ''),
                      datos: { ...defaultAjustes[capaForm.grupo] } as Record<string, unknown>
                    })
                  }}>
                  <option value="ROL">Rol</option>
                  <option value="PERMISO">Permiso</option>
                </select>
              </Field>
              <Field label={capaForm.ambito === 'ROL' ? 'Rol' : 'Permiso'}>
                <select className={inputClass} value={capaForm.objetivo} disabled={capaForm.editando}
                  onChange={(e) => setCapaForm({ ...capaForm, objetivo: e.target.value })}>
                  {capaForm.ambito === 'ROL'
                    ? roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)
                    : catalogo.map((p) => <option key={p.key} value={p.key}>{p.label} — {p.key}</option>)}
                </select>
              </Field>
              <Field label="Grupo visual">
                <select className={inputClass} value={capaForm.grupo} disabled={capaForm.editando}
                  onChange={(e) => {
                    const grupo = e.target.value as CapaForm['grupo']
                    setCapaForm({
                      ...capaForm, grupo,
                      datos: { ...defaultAjustes[grupo] } as Record<string, unknown>
                    })
                  }}>
                  {ajustesGruposVisuales.map((g) => (
                    <option key={g} value={g}>{grupos.find((x) => x.id === g)?.label ?? g}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
              Esta capa se aplica solo a quienes tengan {capaForm.ambito === 'ROL' ? 'el rol' : 'el permiso'} seleccionado. No cambia permisos, rutas ni políticas duras.
            </p>
            <div className="grid max-h-[45vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
              {campos[capaForm.grupo].map((campo) => controlCampo(capaForm.grupo, campo, {
                valor: (clave) => capaForm.datos[clave] ??
                  (defaultAjustes[capaForm.grupo] as Record<string, unknown>)[clave],
                cambiar: cambiarDatoCapa,
                bloqueado: !puedeEditarAjustes
              }))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

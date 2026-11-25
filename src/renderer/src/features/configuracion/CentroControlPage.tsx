import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Pencil, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  moduleLabels, modules, type ModuleKey, type PermissionDef
} from '@shared/permissions'
import {
  ajustesGrupos, defaultAjustes, modulosProtegidos,
  type Ajustes, type AjustesGrupo, type WidgetId
} from '@shared/schemas/ajustes'
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

const grupos: { id: AjustesGrupo; label: string; descripcion: string }[] = [
  { id: 'alertas', label: 'Alertas', descripcion: 'Umbrales y nivel mínimo de las señales tempranas.' },
  { id: 'flujos', label: 'Flujos', descripcion: 'Aprobaciones, motivos y estados de orden de servicio.' },
  { id: 'widgets', label: 'Paneles', descripcion: 'Visibilidad, orden y frecuencia de actualización.' },
  { id: 'rendimiento', label: 'Rendimiento', descripcion: 'Límites, caché y modo de bajo consumo.' },
  { id: 'integraciones', label: 'Integraciones', descripcion: 'Exportación local e impresora de tickets.' },
  { id: 'tema', label: 'Tema avanzado', descripcion: 'Escala, radios, contraste y movimiento.' },
  { id: 'fiscal', label: 'Fiscal avanzado', descripcion: 'NCF, moneda base y redondeo bancario.' },
  { id: 'notificaciones', label: 'Notificaciones', descripcion: 'Sonido, duración y eventos avisados.' },
  { id: 'seguridad', label: 'Seguridad', descripcion: 'Refuerzos visuales; las políticas duras siguen en backend.' },
  { id: 'featureFlags', label: 'Módulos', descripcion: 'Módulos opcionales visibles para todos los perfiles.' }
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
  featureFlags: []
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
  const base = label.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return `custom.${base || 'permiso'}`
}

const permisosExtra: Partial<Record<AjustesGrupo, string>> = {
  seguridad: 'configuracion.ajustes.seguridad.modificar',
  integraciones: 'configuracion.ajustes.integraciones.modificar',
  featureFlags: 'configuracion.ajustes.featureFlags.modificar'
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

  useEffect(() => { void cargarPermisos(); void cargarAjustes() }, [cargarPermisos, cargarAjustes])

  const gruposPermisos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const map = new Map<ModuleKey, PermissionDef[]>()
    for (const p of catalogo) {
      if (q && !`${p.label} ${p.descripcion} ${p.key}`.toLowerCase().includes(q)) continue
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
      for (const g of gruposCambiados) {
        await window.api.invoke('config.ajustes.save', { grupo: g, datos: ajustes[g] })
      }
      await cargarAjustes()
      aplicarTemaAvanzado(useAjustesStore.getState().ajustes.tema ?? defaultAjustes.tema)
      toast.success(`${gruposCambiados.length} grupo(s) guardados y auditados.`)
    } catch (e) { toast.error(errorInfo(e).message) } finally { setGuardandoAjustes(false) }
  }

  async function restaurarGrupo(): Promise<void> {
    try {
      await window.api.invoke('config.ajustes.reset', { grupo })
      await cargarAjustes()
      if (grupo === 'tema') aplicarTemaAvanzado(defaultAjustes.tema)
      toast.success('Grupo restaurado a sus valores por defecto.')
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  function controlCampo(g: AjustesGrupo, campo: Campo): React.JSX.Element {
    const bloqueado = !puedeEditarAjustes || (permisosExtra[g] ? !can(permisosExtra[g]!) : false)
    const valorActual = valor(g, campo.clave)
    if (campo.tipo === 'bool') {
      return (
        <label key={campo.clave} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          <input
            type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600"
            checked={Boolean(valorActual)} disabled={bloqueado}
            onChange={(e) => cambiar(g, campo.clave, e.target.checked)}
          />
          <span><span className="block font-medium">{campo.etiqueta}</span>{campo.hint && <span className="block text-[11px] text-slate-400">{campo.hint}</span>}</span>
        </label>
      )
    }
    if (campo.tipo === 'select') {
      return (
        <Field key={campo.clave} label={campo.etiqueta} hint={campo.hint}>
          <select className={inputClass} value={String(valorActual ?? '')} disabled={bloqueado}
            onChange={(e) => cambiar(g, campo.clave, e.target.value)}>
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
                  onChange={(e) => cambiar(g, campo.clave, e.target.checked
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
            onChange={(v) => cambiar(g, campo.clave, v)}
          />
        ) : (
          <TextInput
            type="text"
            value={String(valorActual ?? '')}
            disabled={bloqueado}
            onChange={(e) => cambiar(g, campo.clave, e.target.value)}
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
                  onChange={(e) => cambiar('featureFlags', 'modulos', ajustes.featureFlags.modulos.map((m) => m.modulo === modulo ? { ...m, activo: e.target.checked } : m))} />
                <span className="flex-1">{moduleLabels[modulo]}</span>
                {protegido && <Badge tone="accent">Protegido</Badge>}
              </label>
            )
          })}
        </div>
      </Card>
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
            <Button variant="secondary" size="sm" onClick={() => { void cargarPermisos(); void cargarAjustes() }}>
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
          { id: 'ajustes', label: 'Ajustes avanzados' },
          { id: 'paneles', label: 'Paneles' },
          { id: 'modulos', label: 'Módulos' }
        ]}
        active={tab}
        onChange={setTab}
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

      {tab === 'ajustes' && (
        <TabPanel>
          {!puedeVerAjustes ? (
            <Card title="Acceso limitado"><p className="text-sm text-slate-500">Necesita `configuracion.ajustes.consultar`.</p></Card>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {grupos.map((g) => (
                  <Button key={g.id} size="sm" variant={grupo === g.id ? 'primary' : 'secondary'} onClick={() => setGrupo(g.id)}>
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
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { allModules, findModule, moduleGroups, modulePermission } from '@/app/modules'
import { moduleLabels, permissionCatalog, type ModuleKey } from '@shared/permissions'
import { defaultAjustes, modulosProtegidos } from '@shared/schemas/ajustes'
import { coincideTexto } from '@shared/texto'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSessionStore } from '@/app/session'
import { useAjustesStore } from '@/app/ajustes-store'

interface FilaCapacidad {
  id: string
  etiqueta: string
  grupo: string
  fase: number
  disponible: boolean
  permiso: string
  descripcion: string
  caracteristicas: string[]
  protegido: boolean
}

const protegidos = new Set<string>(modulosProtegidos)
const fases = [...new Set(allModules.map((m) => m.phase))].sort((a, b) => a - b)
const etiquetaDominio = (dominio: string): string => moduleLabels[dominio as ModuleKey] ?? dominio

function etiquetaPermiso(id: string): string {
  return modulePermission(id) ?? 'Acceso general'
}

/** Catálogo declarado en el renderer: sin IPC y sin datos de ejemplo. */
const todasLasFilas: FilaCapacidad[] = moduleGroups.flatMap((grupo) =>
  grupo.modules.map((modulo) => {
    const dominio = findModule(modulo.id)?.permission?.split('.')[0] ?? modulo.id
    return {
      id: modulo.id,
      etiqueta: modulo.label,
      grupo: grupo.label,
      fase: modulo.phase,
      disponible: modulo.available,
      permiso: etiquetaPermiso(modulo.id),
      descripcion: modulo.description,
      caracteristicas: modulo.features,
      protegido: protegidos.has(dominio)
    }
  })
)

const columnas: Column<FilaCapacidad>[] = [
  { key: 'etiqueta', header: 'Módulo', value: (f) => f.etiqueta },
  { key: 'grupo', header: 'Grupo', value: (f) => f.grupo },
  { key: 'fase', header: 'Fase', value: (f) => `Fase ${f.fase}` },
  {
    key: 'disponible', header: 'Estado',
    render: (f) => (
      <Badge tone={f.disponible ? 'accent' : 'warning'}>
        {f.disponible ? 'Activo' : 'Pendiente'}
      </Badge>
    )
  },
  {
    key: 'permiso', header: 'Permiso',
    render: (f) => (
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-mono text-[11px]">{f.permiso}</span>
        {f.protegido && <Badge tone="info">Protegido</Badge>}
      </div>
    )
  },
  { key: 'caracteristicas', header: 'Características', value: (f) => f.caracteristicas.join(' · ') }
]

function descargarCsv(filas: FilaCapacidad[]): void {
  const escapar = (valor: unknown): string => `"${String(valor ?? '').replace(/"/g, '""')}"`
  const lineas = [
    ['Módulo', 'Grupo', 'Fase', 'Estado', 'Permiso', 'Descripción', 'Características'],
    ...filas.map((f) => [
      f.etiqueta, f.grupo, `Fase ${f.fase}`, f.disponible ? 'Activo' : 'Pendiente',
      f.permiso, f.descripcion, f.caracteristicas.join(' · ')
    ])
  ]
  const csv = lineas.map((linea) => linea.map(escapar).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'capacidades-2026.csv'
  enlace.click()
  URL.revokeObjectURL(url)
}

/** Inventario honesto de lo que el ERP declaró implementar. */
export function Capacidades2026Page(): React.JSX.Element {
  const ctx = useSessionStore((s) => s.ctx)
  const [texto, setTexto] = useState('')
  const [grupo, setGrupo] = useState('Todos')
  const [fase, setFase] = useState('Todas')
  const [soloActivos, setSoloActivos] = useState(false)
  const [soloConPermiso, setSoloConPermiso] = useState(false)
  const moduloActivo = useAjustesStore((s) => s.moduloActivo)
  const flagsModulo = useAjustesStore((s) => s.ajustes.featureFlags?.modulos ?? defaultAjustes.featureFlags.modulos)

  const filtradas = useMemo(() => todasLasFilas.filter((f) => {
    if (grupo !== 'Todos' && f.grupo !== moduleGroups.find((g) => g.id === grupo)?.label) return false
    if (fase !== 'Todas' && f.fase !== Number(fase)) return false
    if (soloActivos && !f.disponible) return false
    if (soloConPermiso) {
      const permiso = modulePermission(f.id)
      if (permiso && !(ctx?.permisos.includes(permiso) ?? false)) return false
    }
    if (texto.trim() && !coincideTexto(
      `${f.etiqueta} ${f.id} ${f.grupo} ${f.descripcion} ${f.permiso} ${f.caracteristicas.join(' ')}`,
      texto
    )) return false
    return true
  }), [ctx, fase, grupo, soloActivos, soloConPermiso, texto])

  const activos = todasLasFilas.filter((f) => f.disponible).length
  const pendientes = todasLasFilas.length - activos
  const fase2026 = todasLasFilas.filter((f) => f.fase === 13 || f.fase === 14).length
  const protegidosCount = todasLasFilas.filter((f) => f.protegido).length
  const flagsActivos = flagsModulo.filter((f) => moduloActivo(f.modulo)).length

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mapa de capacidades 2026"
        subtitle="Catálogo real de módulos, fases y permisos. Sin datos de ejemplo."
        actions={
          <Button variant="secondary" size="sm" onClick={() => descargarCsv(filtradas)}>
            <Download size={14} /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4" title="Filtros del catálogo" subtitle="Los filtros son solo de visualización; no habilitan ni ocultan funcionalidades.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Buscar" className="min-w-[220px] flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <TextInput className="pl-9" value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Ej. cobros, stock, CRM…" />
            </div>
          </Field>
          <Field label="Grupo">
            <select className={inputClass} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              <option value="Todos">Todos</option>
              {moduleGroups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </Field>
          <Field label="Fase">
            <select className={inputClass} value={fase} onChange={(e) => setFase(e.target.value)}>
              <option value="Todas">Todas</option>
              {fases.map((f) => <option key={f} value={f}>Fase {f}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600"
              checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
            Solo implementados
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600"
              checked={soloConPermiso} onChange={(e) => setSoloConPermiso(e.target.checked)} />
            Solo con permiso
          </label>
        </div>
      </Card>

      <Card className="mb-4" title="Alcance del catálogo" subtitle="Conteos calculados sobre las declaraciones de módulos y permisos del proyecto.">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ['Módulos activos', activos],
            ['Pendientes', pendientes],
            ['Fase 2026 (13/14)', fase2026],
            ['Permisos del catálogo', permissionCatalog.length],
            ['Protegidos', protegidosCount]
          ].map(([label, valor]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold">{valor}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <p>Los módulos protegidos no pueden ocultarse desde los feature flags.</p>
          <p>Las características son las declaradas en el catálogo; no se muestran datos simulados.</p>
          <p>
            Dominios de permisos: {Object.keys(moduleLabels).length} módulos
            ({[modulosProtegidos[0], modulosProtegidos[1], modulosProtegidos[2], modulosProtegidos[3]]
              .map(etiquetaDominio).join(', ')}).
            {' '}Feature flags vigentes: {flagsActivos} de {flagsModulo.length} activos.
          </p>
        </div>
      </Card>

      <Card title="Módulos declarados" subtitle="Estado, permiso mínimo y características de cada vista del menú.">
        <DataTable<FilaCapacidad>
          columns={columnas}
          data={filtradas}
          rowKey={(f) => f.id}
          storageKey="capacidades-2026"
          searchPlaceholder="Buscar en el catálogo…"
          pageSize={8}
          emptyText="No hay módulos con esos filtros."
        />
      </Card>
    </div>
  )
}

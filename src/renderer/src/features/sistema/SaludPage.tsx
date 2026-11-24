import { useCallback, useEffect, useState } from 'react'
import { Activity, Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/Toast'

interface Comprobacion {
  nombre: string
  estado: 'ok' | 'advertencia' | 'error'
  detalle: string
}

interface Salud {
  calificacion: 'ok' | 'advertencia' | 'error'
  puntaje: number
  comprobaciones: Comprobacion[]
  baseDatos: {
    archivo: string
    tamanoBytes: number
    paginas: number
    tamanoPagina: number
    versionEsquema: number
    tablas: number
    indices: number
  }
  actividad: {
    usuariosActivos: number
    sesionesActivas: number
    auditoria24h: number
    respaldos: number
    ultimoRespaldo: string
  }
  proceso: {
    aplicacion: string
    electron: string
    node: string
    plataforma: string
    memoriaRssMb: number
    memoriaHeapMb: number
    memoriaTotalMb: number
    memoriaLibreMb: number
    tiempoActivoSeg: number
  }
  calculadoEn: string
}

const tono = (e: Comprobacion['estado']): 'success' | 'warning' | 'danger' =>
  e === 'ok' ? 'success' : e === 'advertencia' ? 'warning' : 'danger'

function descargarInforme(datos: Salud): void {
  const lineas = [
    'ENTERPRISE PRO ERP — Informe de salud',
    `Generado: ${datos.calculadoEn}`,
    `Puntaje: ${datos.puntaje}/100 (${datos.calificacion})`,
    '',
    'Comprobaciones',
    ...datos.comprobaciones.map((c) => `- ${c.nombre}: ${c.estado} — ${c.detalle}`),
    '',
    'Base de datos',
    `- Archivo: ${datos.baseDatos.archivo}`,
    `- Tamaño: ${datos.baseDatos.tamanoBytes} bytes`,
    `- Páginas: ${datos.baseDatos.paginas} de ${datos.baseDatos.tamanoPagina} bytes`,
    `- Tablas: ${datos.baseDatos.tablas} · Índices: ${datos.baseDatos.indices}`,
    '',
    'Actividad',
    `- Usuarios activos: ${datos.actividad.usuariosActivos}`,
    `- Sesiones abiertas: ${datos.actividad.sesionesActivas}`,
    `- Eventos de auditoría (24 h): ${datos.actividad.auditoria24h}`,
    `- Respaldos: ${datos.actividad.respaldos}`,
    '',
    'Proceso',
    `- Aplicación: ${datos.proceso.aplicacion} · Electron ${datos.proceso.electron} · Node ${datos.proceso.node}`,
    `- Plataforma: ${datos.proceso.plataforma}`,
    `- Memoria RSS/Heap: ${datos.proceso.memoriaRssMb}/${datos.proceso.memoriaHeapMb} MB`
  ]
  const url = URL.createObjectURL(new Blob([lineas.join('\r\n')], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `salud-sistema-${datos.calculadoEn.slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

/** Diagnóstico de solo lectura de SQLite, sesiones, respaldos y proceso. */
export function SaludPage(): React.JSX.Element {
  const [datos, setDatos] = useState<Salud | null>(null)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      setDatos(await window.api.invoke<Salud>('salud.resumen'))
    } catch {
      setDatos(null)
      toast.error('No se pudo consultar el estado del sistema.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Salud del sistema"
        subtitle="Integridad de SQLite, espacio, sesiones, respaldos y uso de recursos. Solo lectura."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Verificar
            </Button>
            <Button variant="secondary" size="sm" disabled={!datos} onClick={() => datos && descargarInforme(datos)}>
              <Download size={14} /> Informe
            </Button>
          </div>
        }
      />

      {!datos && (
        <Card>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Activity size={16} /> Cargando diagnóstico…
          </p>
        </Card>
      )}

      {datos && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Puntaje de salud</p>
                <p className="text-3xl font-semibold">{datos.puntaje}<span className="text-base text-slate-400">/100</span></p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={tono(datos.calificacion)}>
                  <ShieldCheck size={13} /> {datos.calificacion}
                </Badge>
                <span className="text-xs text-slate-400">Calculado {datos.calculadoEn}</span>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${datos.puntaje >= 90 ? 'bg-emerald-500' : datos.puntaje >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${datos.puntaje}%` }}
              />
            </div>
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card title="Comprobaciones" subtitle="Resultado de las verificaciones automáticas.">
              <div className="space-y-2">
                {datos.comprobaciones.map((c) => (
                  <div key={c.nombre} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div>
                      <p className="text-sm font-medium">{c.nombre}</p>
                      <p className="text-[11px] text-slate-400">{c.detalle}</p>
                    </div>
                    <Badge tone={tono(c.estado)}>{c.estado}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Base de datos" subtitle="Estado estructural del almacén local.">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Archivo', datos.baseDatos.archivo],
                  ['Tamaño', `${(datos.baseDatos.tamanoBytes / 1024 / 1024).toFixed(1)} MB`],
                  ['Páginas', String(datos.baseDatos.paginas)],
                  ['Tamaño de página', `${datos.baseDatos.tamanoPagina} B`],
                  ['Versión de esquema', String(datos.baseDatos.versionEsquema)],
                  ['Tablas', String(datos.baseDatos.tablas)],
                  ['Índices', String(datos.baseDatos.indices)],
                  ['Último respaldo', datos.actividad.ultimoRespaldo || 'Sin registros']
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                    <dt className="text-[11px] text-slate-500">{k}</dt>
                    <dd className="mt-0.5 font-medium break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Actividad" subtitle="Conteos reales de la base de datos.">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Usuarios activos', datos.actividad.usuariosActivos],
                  ['Sesiones abiertas', datos.actividad.sesionesActivas],
                  ['Auditoría 24 h', datos.actividad.auditoria24h],
                  ['Respaldos', datos.actividad.respaldos]
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                    <p className="text-[11px] text-slate-500">{k}</p>
                    <p className="mt-0.5 text-lg font-semibold">{String(v)}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Proceso" subtitle="Versión y recursos de la aplicación local.">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Aplicación', datos.proceso.aplicacion],
                  ['Electron', datos.proceso.electron],
                  ['Node.js', datos.proceso.node],
                  ['Plataforma', datos.proceso.plataforma],
                  ['Memoria RSS', `${datos.proceso.memoriaRssMb} MB`],
                  ['Heap usado', `${datos.proceso.memoriaHeapMb} MB`],
                  ['Memoria libre', `${datos.proceso.memoriaLibreMb} MB`],
                  ['Tiempo activo', `${Math.round(datos.proceso.tiempoActivoSeg / 60)} min`]
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                    <dt className="text-[11px] text-slate-500">{k}</dt>
                    <dd className="mt-0.5 font-medium break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

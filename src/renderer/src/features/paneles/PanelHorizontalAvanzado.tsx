import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeftRight, ArrowUp, Ban, ChevronDown, ChevronRight,
  ClipboardList, CreditCard, ExternalLink, PackageSearch, RefreshCw,
  ShieldCheck, WalletCards
} from 'lucide-react'
import {
  panelHorizontalColapsadosSchema, panelHorizontalFiltroSchema, panelHorizontalIds,
  panelHorizontalOrdenSchema,
  type PanelHorizontalDatos, type PanelHorizontalFiltro, type PanelHorizontalId,
  type PanelHorizontalRespuesta
} from '@shared/schemas/panel-horizontal'
import { can, errorInfo, useSessionStore } from '@/app/session'
import { useAppStore } from '@/app/store'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput } from '@/components/ui/Field'
import { StatCard } from '@/components/ui/StatCard'
import { toast } from '@/components/ui/Toast'
import { formatFecha, money, number } from '@/lib/format'

type Colapsados = Partial<Record<PanelHorizontalId, boolean>>

const CLAVE_ORDEN = 'erp-panel-horizontal-orden'
const CLAVE_COLAPSADOS = 'erp-panel-horizontal-colapsados'

const titulos: Record<PanelHorizontalId, { titulo: string; subtitulo: string }> = {
  cobranza: {
    titulo: 'Cola de cobranza', subtitulo: 'Priorización por vencimiento, crédito y recencia'
  },
  inventario: {
    titulo: 'Reposición ABC', subtitulo: 'Rotación, cobertura y stock crítico por almacén'
  },
  agenda: {
    titulo: 'Agenda operativa', subtitulo: 'Compromisos de servicios y seguimiento de CRM'
  },
  presupuesto: {
    titulo: 'Desviación presupuestaria', subtitulo: 'Ejecución real frente al presupuesto aprobado'
  },
  cuadre: {
    titulo: 'Cuadre operativo', subtitulo: 'Diferencias de caja y movimientos bancarios sin soporte'
  }
}

/** Destino operativo por panel; se elige el primero que el perfil puede abrir. */
const navegacion: Record<PanelHorizontalId, { vista: string; permiso: string }[]> = {
  cobranza: [{ vista: 'cxc', permiso: 'cxc.consultar' }],
  inventario: [{ vista: 'control-stock', permiso: 'inventario.consultar' }],
  agenda: [
    { vista: 'servicios', permiso: 'servicios.consultar' },
    { vista: 'crm', permiso: 'crm.consultar' }
  ],
  presupuesto: [{ vista: 'presupuestos', permiso: 'presupuestos.consultar' }],
  cuadre: [
    { vista: 'cajas', permiso: 'cajas.consultar' },
    { vista: 'bancos', permiso: 'bancos.consultar' }
  ]
}

const iconos: Record<PanelHorizontalId, typeof WalletCards> = {
  cobranza: WalletCards,
  inventario: PackageSearch,
  agenda: ClipboardList,
  presupuesto: CreditCard,
  cuadre: ShieldCheck
}

function leerPreferencias(): { orden: PanelHorizontalId[]; colapsados: Colapsados } {
  let orden = [...panelHorizontalIds]
  let colapsados: Colapsados = {}
  try {
    const guardadoOrden = localStorage.getItem(CLAVE_ORDEN)
    if (guardadoOrden) orden = panelHorizontalOrdenSchema.parse(JSON.parse(guardadoOrden))
  } catch { /* preferencia corrupta: se ignoran */ }
  try {
    const guardados = localStorage.getItem(CLAVE_COLAPSADOS)
    if (guardados) colapsados = panelHorizontalColapsadosSchema.parse(JSON.parse(guardados))
  } catch { /* preferencia corrupta: se ignoran */ }
  return { orden, colapsados }
}

function descargarCsv(datos: PanelHorizontalDatos, filtro: PanelHorizontalFiltro): void {
  const lineas: string[] = ['seccion,clave,detalle,valor']
  const agregar = (seccion: string, clave: string, detalle: string, valor: string | number): void => {
    const celda = (texto: string): string => `"${texto.replaceAll('"', '""')}"`
    lineas.push([seccion, clave, detalle, valor].map((dato) => celda(String(dato))).join(','))
  }
  for (const fila of datos.cobranza?.filas ?? []) {
    agregar('cobranza', fila.numero, fila.cliente, `${fila.saldoCent / 100} · ${fila.sugerencia}`)
  }
  for (const fila of datos.inventario?.filas ?? []) {
    agregar('inventario', fila.codigo, `${fila.producto} / ${fila.almacen}`, `${fila.existencia} · ${fila.clase}`)
  }
  for (const fila of datos.agenda?.ordenes ?? []) {
    agregar('agenda', fila.numero, fila.cliente, `${fila.fechaCompromiso} · ${fila.estado}`)
  }
  for (const fila of datos.agenda?.leads ?? []) {
    agregar('agenda', fila.nombre, fila.empresa, `${fila.proximoSeguimiento} · ${fila.estado}`)
  }
  for (const fila of datos.presupuesto?.filas ?? []) {
    agregar('presupuesto', fila.numero, fila.descripcion, `${fila.ejecutadoCent / 100} de ${fila.montoCent / 100}`)
  }
  for (const fila of datos.cuadre?.caja ?? []) {
    agregar('cuadre', `caja-${fila.sesionId}`, fila.estado, `${fila.teoricoCent / 100} vs ${fila.arqueoCent / 100}`)
  }
  for (const fila of datos.cuadre?.banco ?? []) {
    agregar('cuadre', `banco-${fila.cuentaId}`, fila.cuenta, fila.diferenciaCent === null ? 'sin conciliación' : fila.diferenciaCent / 100)
  }
  const blob = new Blob([`\uFEFF${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `panel-horizontal_${filtro.desde || 'inicio'}_${filtro.hasta || new Date().toISOString().slice(0, 10)}.csv`
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PanelHorizontalAvanzado(): ReactNode {
  const [filtro, setFiltro] = useState<PanelHorizontalFiltro>(() => panelHorizontalFiltroSchema.parse({}))
  const [respuesta, setRespuesta] = useState<PanelHorizontalRespuesta | null>(null)
  const [cargando, setCargando] = useState(false)
  const [preferencias, setPreferencias] = useState(leerPreferencias)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const ctx = useSessionStore((s) => s.ctx)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      setRespuesta(await window.api.invoke<PanelHorizontalRespuesta>('panel.horizontal.resumen', filtro))
    } catch (error) {
      toast.error(errorInfo(error).message)
    } finally {
      setCargando(false)
    }
  }, [filtro])

  useEffect(() => { void cargar() }, [cargar])

  function cambiarCampo<K extends keyof PanelHorizontalFiltro>(clave: K, valor: PanelHorizontalFiltro[K]): void {
    setFiltro((actual) => ({ ...actual, [clave]: valor }))
  }

  function mover(id: PanelHorizontalId, direccion: -1 | 1): void {
    setPreferencias((actual) => {
      const indice = actual.orden.indexOf(id)
      const destino = indice + direccion
      if (indice < 0 || destino < 0 || destino >= actual.orden.length) return actual
      const orden = [...actual.orden]
      ;[orden[indice], orden[destino]] = [orden[destino], orden[indice]]
      try { localStorage.setItem(CLAVE_ORDEN, JSON.stringify(orden)) } catch { /* sin almacenamiento */ }
      return { ...actual, orden }
    })
  }

  function alternar(id: PanelHorizontalId): void {
    setPreferencias((actual) => {
      const colapsados = { ...actual.colapsados, [id]: !actual.colapsados[id] }
      try { localStorage.setItem(CLAVE_COLAPSADOS, JSON.stringify(colapsados)) } catch { /* sin almacenamiento */ }
      return { ...actual, colapsados }
    })
  }

  function irA(id: PanelHorizontalId): void {
    const destino = navegacion[id].find((opcion) => can(opcion.permiso))
    if (!destino || !can('espacio.consultar')) return
    setActiveView(destino.vista)
  }

  const datos = respuesta?.datos
  const permitidos = useMemo(
    () => new Set(respuesta?.permitidos ?? []),
    [respuesta]
  )
  const hayDatos = Boolean(datos && Object.values(datos).some((valor) => valor !== null))

  function tarjeta(id: PanelHorizontalId, contenido: ReactNode, kpis: ReactNode): ReactNode {
    const meta = titulos[id]
    const Icono = iconos[id]
    const colapsado = Boolean(preferencias.colapsados[id])
    const indice = preferencias.orden.indexOf(id)
    if (!permitidos.has(id) || !datos) return null
    return (
      <Card
        key={id}
        title={meta.titulo}
        subtitle={meta.subtitulo}
        className="min-w-[22rem] flex-1"
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="erp-focus rounded p-1 text-slate-500 disabled:opacity-40"
              title="Mover a la izquierda"
              aria-label={`Mover ${meta.titulo} a la izquierda`}
              disabled={indice <= 0}
              onClick={() => mover(id, -1)}
            ><ArrowLeftRight size={14} className="rotate-180" /></button>
            <button
              type="button"
              className="erp-focus rounded p-1 text-slate-500 disabled:opacity-40"
              title="Mover a la derecha"
              aria-label={`Mover ${meta.titulo} a la derecha`}
              disabled={indice >= preferencias.orden.length - 1}
              onClick={() => mover(id, 1)}
            ><ArrowLeftRight size={14} /></button>
            <button
              type="button"
              className="erp-focus rounded p-1 text-slate-500"
              title={colapsado ? 'Expandir panel' : 'Colapsar panel'}
              aria-label={`${colapsado ? 'Expandir' : 'Colapsar'} ${meta.titulo}`}
              aria-expanded={!colapsado}
              onClick={() => alternar(id)}
            >{colapsado ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">{kpis}</div>
            <Button
              variant="ghost" size="sm"
              onClick={() => irA(id)}
              title={`Abrir ${meta.titulo}`}
              aria-label={`Abrir ${meta.titulo}`}
            ><ExternalLink size={14} /></Button>
          </div>
          {!colapsado && contenido}
        </div>
        <span className="sr-only"><Icono aria-hidden="true" /> Panel basado en datos reales.</span>
      </Card>
    )
  }

  const columnasCobranza: Column<NonNullable<PanelHorizontalDatos['cobranza']>['filas'][number]>[] = [
    { key: 'numero', header: 'Documento', value: (f) => f.numero },
    { key: 'cliente', header: 'Cliente', value: (f) => f.cliente },
    { key: 'saldoCent', header: 'Saldo', value: (f) => money(f.saldoCent) },
    { key: 'diasVencido', header: 'Días', value: (f) => f.diasVencido },
    { key: 'score', header: 'Prioridad', value: (f) => f.score },
    { key: 'sugerencia', header: 'Sugerencia', value: (f) => f.sugerencia }
  ]
  const columnasInventario: Column<NonNullable<PanelHorizontalDatos['inventario']>['filas'][number]>[] = [
    { key: 'codigo', header: 'Código', value: (f) => f.codigo },
    { key: 'producto', header: 'Producto', value: (f) => f.producto },
    { key: 'almacen', header: 'Almacén', value: (f) => f.almacen },
    { key: 'existencia', header: 'Existencia', value: (f) => number(f.existencia) },
    { key: 'consumo', header: 'Consumo', value: (f) => number(f.consumo) },
    { key: 'coberturaDias', header: 'Cobertura', value: (f) => f.coberturaDias === null ? '—' : `${f.coberturaDias} d` },
    { key: 'clase', header: 'Clase', value: (f) => f.clase },
    { key: 'nivel', header: 'Nivel', value: (f) => f.nivel }
  ]
  const columnasOrdenes: Column<NonNullable<PanelHorizontalDatos['agenda']>['ordenes'][number]>[] = [
    { key: 'numero', header: 'Orden', value: (f) => f.numero },
    { key: 'cliente', header: 'Cliente', value: (f) => f.cliente },
    { key: 'fechaCompromiso', header: 'Compromiso', value: (f) => formatFecha(f.fechaCompromiso) },
    { key: 'tecnico', header: 'Técnico', value: (f) => f.tecnico },
    { key: 'minutos', header: 'Minutos', value: (f) => f.minutos },
    { key: 'estado', header: 'Estado', value: (f) => f.estado }
  ]
  const columnasLeads: Column<NonNullable<PanelHorizontalDatos['agenda']>['leads'][number]>[] = [
    { key: 'nombre', header: 'Lead', value: (f) => f.nombre },
    { key: 'empresa', header: 'Empresa', value: (f) => f.empresa },
    { key: 'proximoSeguimiento', header: 'Seguimiento', value: (f) => formatFecha(f.proximoSeguimiento) },
    { key: 'probabilidad', header: 'Probabilidad', value: (f) => `${f.probabilidad}%` },
    { key: 'valorEstimadoCent', header: 'Valor', value: (f) => money(f.valorEstimadoCent) },
    { key: 'estado', header: 'Estado', value: (f) => f.estado }
  ]
  const columnasPresupuesto: Column<NonNullable<PanelHorizontalDatos['presupuesto']>['filas'][number]>[] = [
    { key: 'numero', header: 'Presupuesto', value: (f) => f.numero },
    { key: 'categoria', header: 'Categoría', value: (f) => f.categoria },
    { key: 'descripcion', header: 'Descripción', value: (f) => f.descripcion },
    { key: 'montoCent', header: 'Presupuesto', value: (f) => money(f.montoCent) },
    { key: 'ejecutadoCent', header: 'Ejecutado', value: (f) => money(f.ejecutadoCent) },
    { key: 'pctEjecutado', header: '%', value: (f) => `${f.pctEjecutado}%` },
    { key: 'nivel', header: 'Nivel', value: (f) => f.nivel }
  ]
  const columnasCaja: Column<NonNullable<PanelHorizontalDatos['cuadre']>['caja'][number]>[] = [
    { key: 'fechaApertura', header: 'Apertura', value: (f) => formatFecha(f.fechaApertura) },
    { key: 'estado', header: 'Estado', value: (f) => f.estado },
    { key: 'teoricoCent', header: 'Teórico', value: (f) => money(f.teoricoCent) },
    { key: 'arqueoCent', header: 'Arqueo', value: (f) => money(f.arqueoCent) },
    { key: 'diferenciaCent', header: 'Diferencia', value: (f) => money(f.diferenciaCent) }
  ]
  const columnasBanco: Column<NonNullable<PanelHorizontalDatos['cuadre']>['banco'][number]>[] = [
    { key: 'cuenta', header: 'Cuenta', value: (f) => f.cuenta },
    { key: 'saldoLibroCent', header: 'Libro', value: (f) => money(f.saldoLibroCent) },
    { key: 'saldoBancoCent', header: 'Banco', value: (f) => f.saldoBancoCent === null ? '—' : money(f.saldoBancoCent) },
    { key: 'diferenciaCent', header: 'Diferencia', value: (f) => f.diferenciaCent === null ? '—' : money(f.diferenciaCent) },
    { key: 'noConciliados', header: 'Sin conciliar', value: (f) => f.noConciliados }
  ]
  const columnasSinSoporte: Column<NonNullable<PanelHorizontalDatos['cuadre']>['movimientosSinSoporte'][number]>[] = [
    { key: 'fecha', header: 'Fecha', value: (f) => formatFecha(f.fecha) },
    { key: 'tipo', header: 'Tipo', value: (f) => f.tipo },
    { key: 'montoCent', header: 'Monto', value: (f) => money(f.montoCent) },
    { key: 'referencia', header: 'Referencia', value: (f) => f.referencia }
  ]

  const tarjetas: Record<PanelHorizontalId, ReactNode> = {
    cobranza: tarjeta('cobranza', (
      <DataTable
        columns={columnasCobranza} data={datos?.cobranza?.filas ?? []}
        rowKey={(f) => f.id} storageKey="panel-horizontal-cobranza"
        searchPlaceholder="Buscar documento o cliente…"
        loading={cargando} emptyText="No hay cuentas por cobrar con saldo."
      />
    ), <>
      <StatCard dense label="Documentos" value={number(datos?.cobranza?.resumen.documentos ?? 0)} />
      <StatCard dense label="Saldo" value={money(datos?.cobranza?.resumen.saldoCent ?? 0)} tone="accent" />
      <StatCard dense label="Urgentes" value={number(datos?.cobranza?.resumen.urgentes ?? 0)} tone="danger" />
    </>),
    inventario: tarjeta('inventario', (
      <DataTable
        columns={columnasInventario} data={datos?.inventario?.filas ?? []}
        rowKey={(f) => `${f.productoId}-${f.almacenId}`} storageKey="panel-horizontal-inventario"
        searchPlaceholder="Buscar producto o código…"
        loading={cargando} emptyText="No hay existencias que coincidan."
      />
    ), <>
      <StatCard dense label="Productos" value={number(datos?.inventario?.resumen.productos ?? 0)} />
      <StatCard dense label="Críticos" value={number(datos?.inventario?.resumen.criticos ?? 0)} tone="danger" />
      <StatCard dense label="Reposición" value={datos?.inventario?.filas[0]?.costoOculto ? '—' : money(datos?.inventario?.resumen.valorReposicionCent ?? 0)} tone="warning" />
    </>),
    agenda: tarjeta('agenda', (
      <div className="space-y-3">
        <DataTable
          columns={columnasOrdenes} data={datos?.agenda?.ordenes ?? []}
          rowKey={(f) => f.id} storageKey="panel-horizontal-agenda-ordenes"
          searchPlaceholder="Buscar orden o cliente…"
          loading={cargando} emptyText="No hay órdenes pendientes."
        />
        {datos?.agenda?.secciones.crm && (
          <DataTable
            columns={columnasLeads} data={datos.agenda.leads}
            rowKey={(f) => f.id} storageKey="panel-horizontal-agenda-leads"
            searchPlaceholder="Buscar lead o empresa…"
            loading={cargando} emptyText="No hay leads con seguimiento pendiente."
          />
        )}
      </div>
    ), <>
      <StatCard dense label="Órdenes vencidas" value={number(datos?.agenda?.resumen.ordenesVencidas ?? 0)} tone="danger" />
      <StatCard dense label="Hoy" value={number(datos?.agenda?.resumen.ordenesHoy ?? 0)} tone="warning" />
      <StatCard dense label="Leads vencidos" value={number(datos?.agenda?.resumen.leadsVencidos ?? 0)} tone="danger" />
      <StatCard dense label="Minutos" value={number(datos?.agenda?.resumen.minutos ?? 0)} />
    </>),
    presupuesto: tarjeta('presupuesto', (
      <DataTable
        columns={columnasPresupuesto} data={datos?.presupuesto?.filas ?? []}
        rowKey={(f) => `${f.presupuestoId}-${f.numero}-${f.categoria}`}
        storageKey="panel-horizontal-presupuesto"
        searchPlaceholder="Buscar presupuesto o categoría…"
        loading={cargando} emptyText="No hay líneas presupuestarias."
      />
    ), <>
      <StatCard dense label="Líneas" value={number(datos?.presupuesto?.resumen.lineas ?? 0)} />
      <StatCard dense label="En alerta" value={number(datos?.presupuesto?.resumen.enAlerta ?? 0)} tone="warning" />
      <StatCard dense label="Disponible" value={money(datos?.presupuesto?.resumen.disponibleCent ?? 0)} tone="success" />
    </>),
    cuadre: tarjeta('cuadre', (
      <div className="space-y-3">
        {datos?.cuadre?.secciones.cajas && (
          <DataTable
            columns={columnasCaja} data={datos.cuadre.caja}
            rowKey={(f) => f.sesionId} storageKey="panel-horizontal-cuadre-caja"
            searchPlaceholder="Buscar sesión o estado…"
            loading={cargando} emptyText="No hay sesiones de caja."
          />
        )}
        {datos?.cuadre?.secciones.bancos && (
          <DataTable
            columns={columnasBanco} data={datos.cuadre.banco}
            rowKey={(f) => f.cuentaId} storageKey="panel-horizontal-cuadre-banco"
            searchPlaceholder="Buscar cuenta…"
            loading={cargando} emptyText="No hay cuentas activas."
          />
        )}
        <DataTable
          columns={columnasSinSoporte} data={datos?.cuadre?.movimientosSinSoporte ?? []}
          rowKey={(f) => Number(f.id)} storageKey="panel-horizontal-cuadre-sin-soporte"
          searchPlaceholder="Buscar referencia…"
          loading={cargando} emptyText="No hay movimientos sin soporte."
        />
      </div>
    ), <>
      <StatCard dense label="Sesiones abiertas" value={number(datos?.cuadre?.resumen.sesionesAbiertas ?? 0)} />
      <StatCard dense label="Diferencias" value={money(datos?.cuadre?.resumen.diferenciasCent ?? 0)} tone="warning" />
      <StatCard dense label="Sin soporte" value={number(datos?.cuadre?.resumen.sinSoporte ?? 0)} tone="danger" />
      <StatCard dense label="Cuentas" value={number(datos?.cuadre?.resumen.cuentas ?? 0)} />
    </>)
  }

  return (
    <div className="space-y-4" aria-busy={cargando}>
      <Card
        title="Tablero horizontal avanzado"
        subtitle="Cinco paneles operativos alimentados por SQLite; cada sección respeta tus permisos reales."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
            <Button
              variant="secondary" size="sm" disabled={!hayDatos}
              onClick={() => datos && descargarCsv(datos, filtro)}
              title="Exportar los datos visibles del tablero"
            >Exportar CSV</Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Desde">
            <TextInput type="date" value={filtro.desde} onChange={(e) => cambiarCampo('desde', e.target.value)} />
          </Field>
          <Field label="Hasta">
            <TextInput type="date" value={filtro.hasta} onChange={(e) => cambiarCampo('hasta', e.target.value)} />
          </Field>
          <Field label="Texto">
            <TextInput value={filtro.texto} maxLength={60} placeholder="Documento, cliente, producto…"
              onChange={(e) => cambiarCampo('texto', e.target.value)} />
          </Field>
          <Field label="Límite por panel">
            <TextInput type="number" min={1} max={50} value={filtro.limite}
              onChange={(e) => cambiarCampo('limite', Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Solo urgentes">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" className="erp-focus" checked={filtro.soloUrgentes}
                onChange={(e) => cambiarCampo('soloUrgentes', e.target.checked)} />
              Mostrar únicamente alertas
            </label>
          </Field>
        </div>
        {respuesta && respuesta.denegados.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <Ban size={14} />
            <span>Paneles no disponibles para tu perfil:</span>
            {respuesta.denegados.map((item) => (
              <span key={item.id} title={item.motivo}>
                <Badge tone="warning">{titulos[item.id].titulo}</Badge>
              </span>
            ))}
          </div>
        )}
        {!respuesta && !cargando && (
          <p className="mt-3 text-sm text-slate-500">No se pudo cargar el tablero. usa «Actualizar» para reintentar.</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <ArrowUp size={14} /> Usa los controles de cada tarjeta para reordenarla o colapsarla. La preferencia se guarda en esta estación.
        {ctx && <span className="ml-auto">Sesión activa · permisos verificados en servidor</span>}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:overflow-x-auto xl:pb-2">
        {preferencias.orden.map((id) => tarjetas[id])}
      </div>
    </div>
  )
}

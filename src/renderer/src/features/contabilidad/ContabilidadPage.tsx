import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'

type Fila = Record<string, unknown>
type Pestaña = 'cuentas' | 'asientos' | 'periodos' | 'libros'
type SubPestaña = 'diario' | 'mayor' | 'comprobacion' | 'resultados' | 'balance'
type RespuestaOk = { ok: true }
type Integracion = { asientosCreados: number; documentos: number; motivo?: string }
type EstadoResultados = {
  ingresosCent: number
  gastosCent: number
  resultadoCent: number
  detalle: Fila[]
}
type BalanceGeneral = {
  activoCent: number
  pasivoCent: number
  patrimonioCent: number
  resultadoCent: number
  pasivoMasPatrimonioCent: number
  detalle: Fila[]
}
type LineaForm = {
  cuentaId: string
  debe: string
  haber: string
  descripcion: string
}

const TIPOS_CUENTA = ['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO']
const NATURALEZAS = ['DEUDORA', 'ACREEDORA']
const TIPOS_ASIENTO = ['MANUAL', 'VENTA', 'COMPRA', 'PAGO', 'COBRO', 'AJUSTE']

const txt = (f: Fila, k: string): string => String(f[k] ?? '')
const num = (f: Fila, k: string): number => Number(f[k] ?? 0)
const bool = (f: Fila, k: string): boolean => Boolean(f[k])
const valor = (form: Record<string, string>, k: string): string => form[k] ?? ''
const actualizar = (form: Record<string, string>, k: string, v: string): Record<string, string> => ({ ...form, [k]: v })
const filas = (v: unknown): Fila[] => (Array.isArray(v) ? (v as Fila[]) : [])
/** La UI trabaja en pesos; el backend guarda centavos enteros. */
const centavos = (pesos: string): number => Math.round((Number.parseFloat(pesos) || 0) * 100)
const errorTexto = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

function CampoTexto({
  label, value, onChange, type = 'text', placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}): React.JSX.Element {
  return (
    <Field label={label}>
      <TextInput
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

function CampoSelect({
  label, value, options, onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

function lineaVacia(): LineaForm {
  return { cuentaId: '', debe: '', haber: '', descripcion: '' }
}

/** Contabilidad: plan de cuentas, asientos, periodos y libros/balances por IPC validado. */
export function ContabilidadPage(): React.JSX.Element {
  const [tab, setTab] = useState<Pestaña>('cuentas')
  const [subTab, setSubTab] = useState<SubPestaña>('diario')
  const [cuentas, setCuentas] = useState<Fila[]>([])
  const [asientos, setAsientos] = useState<Fila[]>([])
  const [periodos, setPeriodos] = useState<Fila[]>([])
  const [libro, setLibro] = useState<Fila[]>([])
  const [mayor, setMayor] = useState<Fila[]>([])
  const [comprobacion, setComprobacion] = useState<Fila[]>([])
  const [resultados, setResultados] = useState<EstadoResultados | null>(null)
  const [balance, setBalance] = useState<BalanceGeneral | null>(null)
  const [cuentaMayor, setCuentaMayor] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [modalCuenta, setModalCuenta] = useState('')
  const [modalAsiento, setModalAsiento] = useState(false)
  const [cuentaEditar, setCuentaEditar] = useState<Fila | null>(null)
  const [formCuenta, setFormCuenta] = useState<Record<string, string>>({})
  const [formAsiento, setFormAsiento] = useState<Record<string, string>>({})
  const [formPeriodo, setFormPeriodo] = useState<Record<string, string>>({ anio: '', mes: '' })
  const [lineas, setLineas] = useState<LineaForm[]>([])
  const [cargando, setCargando] = useState(false)
  const [cargandoLibros, setCargandoLibros] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true)
    try {
      const [cs, as, ps] = await Promise.all([
        window.api.invoke<Fila[]>('cont.cuentas'),
        window.api.invoke<Fila[]>('cont.asientos'),
        window.api.invoke<Fila[]>('cont.periodos')
      ])
      const listaCuentas = cs ?? []
      setCuentas(listaCuentas)
      setAsientos(as ?? [])
      setPeriodos(ps ?? [])
      setCuentaMayor((prev) => prev || (listaCuentas.length > 0 ? String(listaCuentas[0].id) : ''))
    } catch (error) {
      toast.error(errorTexto(error, 'No se pudieron cargar los datos contables.'))
    } finally {
      setCargando(false)
    }
  }, [])

  const cargarLibros = useCallback(async (): Promise<void> => {
    setCargandoLibros(true)
    try {
      switch (subTab) {
        case 'diario':
          setLibro((await window.api.invoke<Fila[]>('cont.libroDiario')) ?? [])
          break
        case 'mayor': {
          if (!cuentaMayor) {
            setMayor([])
            break
          }
          const input = {
            cuentaId: Number(cuentaMayor),
            ...(fechaDesde ? { fechaDesde } : {}),
            ...(fechaHasta ? { fechaHasta } : {})
          }
          setMayor((await window.api.invoke<Fila[]>('cont.mayor', input)) ?? [])
          break
        }
        case 'comprobacion':
          setComprobacion((await window.api.invoke<Fila[]>('cont.balanceComprobacion')) ?? [])
          break
        case 'resultados':
          setResultados(await window.api.invoke<EstadoResultados>('cont.estadoResultados'))
          break
        case 'balance':
          setBalance(await window.api.invoke<BalanceGeneral>('cont.balanceGeneral'))
          break
      }
    } catch (error) {
      toast.error(errorTexto(error, 'No se pudo cargar el informe contable.'))
    } finally {
      setCargandoLibros(false)
    }
  }, [subTab, cuentaMayor, fechaDesde, fechaHasta])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    if (tab === 'libros') void cargarLibros()
  }, [tab, cargarLibros])

  const ejecutar = async (canal: string, input: unknown, mensaje: string): Promise<void> => {
    try {
      await window.api.invoke<RespuestaOk>(canal, input)
      toast.success(mensaje)
      await cargar()
    } catch (error) {
      toast.error(errorTexto(error, 'No se pudo completar la operación.'))
    }
  }

  const integrar = async (): Promise<void> => {
    setGuardando(true)
    try {
      const r = await window.api.invoke<Integracion>('cont.integrar', {})
      const detalle = `${r.asientosCreados} asiento(s) creado(s) a partir de ${r.documentos} documento(s).`
      toast.success(r.motivo ? `Integración completada: ${detalle} ${r.motivo}` : `Integración completada: ${detalle}`)
      await cargar()
    } catch (error) {
      toast.error(errorTexto(error, 'No se pudo integrar los documentos.'))
    } finally {
      setGuardando(false)
    }
  }

  const abrirCuenta = (fila?: Fila): void => {
    setCuentaEditar(fila ?? null)
    setFormCuenta(fila
      ? {
          nombre: txt(fila, 'nombre'),
          tipo: txt(fila, 'tipo'),
          naturaleza: txt(fila, 'naturaleza'),
          aceptaMovimiento: bool(fila, 'aceptaMovimiento') ? 'true' : 'false',
          activa: bool(fila, 'activa') ? 'true' : 'false'
        }
      : {
          codigo: '',
          nombre: '',
          tipo: 'ACTIVO',
          naturaleza: 'DEUDORA',
          aceptaMovimiento: 'true',
          activa: 'true'
        })
    setModalCuenta(fila ? 'editar' : 'crear')
  }

  const guardarCuenta = async (): Promise<void> => {
    if (!valor(formCuenta, 'codigo').trim() && modalCuenta === 'crear') {
      toast.error('El código de la cuenta es obligatorio.')
      return
    }
    if (!valor(formCuenta, 'nombre').trim()) {
      toast.error('El nombre de la cuenta es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      if (modalCuenta === 'crear') {
        await window.api.invoke<Fila>('cont.cuenta.crear', {
          codigo: valor(formCuenta, 'codigo').trim(),
          nombre: valor(formCuenta, 'nombre').trim(),
          tipo: valor(formCuenta, 'tipo'),
          naturaleza: valor(formCuenta, 'naturaleza'),
          aceptaMovimiento: valor(formCuenta, 'aceptaMovimiento') === 'true'
        })
      } else {
        await window.api.invoke<Fila>('cont.cuenta.modificar', {
          id: num(cuentaEditar ?? {}, 'id'),
          nombre: valor(formCuenta, 'nombre').trim(),
          tipo: valor(formCuenta, 'tipo'),
          naturaleza: valor(formCuenta, 'naturaleza'),
          aceptaMovimiento: valor(formCuenta, 'aceptaMovimiento') === 'true',
          activa: valor(formCuenta, 'activa') === 'true'
        })
      }
      setModalCuenta('')
      toast.success('Cuenta guardada correctamente.')
      await cargar()
    } catch (error) {
      toast.error(errorTexto(error, 'No se pudo guardar la cuenta.'))
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstadoCuenta = (fila: Fila): void => {
    const activa = !bool(fila, 'activa')
    void ejecutar('cont.cuenta.estado', { id: num(fila, 'id'), activa }, `Cuenta ${activa ? 'activada' : 'desactivada'}.`)
  }

  const abrirAsiento = (): void => {
    setFormAsiento({
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: '',
      tipo: 'MANUAL'
    })
    setLineas([lineaVacia()])
    setModalAsiento(true)
  }

  const cambiarLinea = (index: number, campo: keyof LineaForm, v: string): void => {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, [campo]: v } : l)))
  }

  const totalDebeCent = lineas.reduce((sum, l) => sum + centavos(l.debe), 0)
  const totalHaberCent = lineas.reduce((sum, l) => sum + centavos(l.haber), 0)
  const asientoValido =
    lineas.length > 0 &&
    totalDebeCent > 0 &&
    totalDebeCent === totalHaberCent &&
    lineas.every((l) => l.cuentaId !== '')

  const guardarAsiento = async (): Promise<void> => {
    if (!asientoValido) {
      toast.error('El debe y el haber deben ser iguales y mayores que cero.')
      return
    }
    setGuardando(true)
    try {
      await window.api.invoke<Fila>('cont.asiento.crear', {
        fecha: valor(formAsiento, 'fecha'),
        descripcion: valor(formAsiento, 'descripcion'),
        tipo: valor(formAsiento, 'tipo'),
        lineas: lineas.map((l) => ({
          cuentaId: Number(l.cuentaId),
          debeCent: centavos(l.debe),
          haberCent: centavos(l.haber),
          descripcion: l.descripcion
        }))
      })
      setModalAsiento(false)
      toast.success('Asiento creado correctamente.')
      await cargar()
    } catch (error) {
      toast.error(errorTexto(error, 'No se pudo guardar el asiento.'))
    } finally {
      setGuardando(false)
    }
  }

  const abrirPeriodo = (anio: number, mes: number): void => {
    void ejecutar('cont.periodo.abrir', { anio, mes }, `Período ${mes}/${anio} abierto.`)
  }

  const cuentasMovimiento = cuentas.filter((c) => bool(c, 'activa') && bool(c, 'aceptaMovimiento'))
  const opcionesCuentas = cuentasMovimiento.map((c) => ({
    value: String(num(c, 'id')),
    label: `${txt(c, 'codigo')} — ${txt(c, 'nombre')}`
  }))

  const columnasCuentas: Column<Fila>[] = [
    { key: 'codigo', header: 'Código', value: (r) => txt(r, 'codigo') },
    { key: 'nombre', header: 'Nombre', value: (r) => txt(r, 'nombre') },
    { key: 'tipo', header: 'Tipo', value: (r) => txt(r, 'tipo') },
    { key: 'naturaleza', header: 'Naturaleza', value: (r) => txt(r, 'naturaleza') },
    {
      key: 'estado', header: 'Estado',
      render: (r) => (
        <Badge tone={bool(r, 'activa') ? 'success' : 'warning'}>
          {bool(r, 'activa') ? 'Activa' : 'Inactiva'}
        </Badge>
      )
    }
  ]

  const columnasAsientos: Column<Fila>[] = [
    { key: 'numero', header: 'Número', value: (r) => txt(r, 'numero') },
    { key: 'fecha', header: 'Fecha', value: (r) => txt(r, 'fecha') },
    { key: 'descripcion', header: 'Descripción', value: (r) => txt(r, 'descripcion') },
    { key: 'tipo', header: 'Tipo', value: (r) => txt(r, 'tipo') },
    {
      key: 'estado', header: 'Estado',
      render: (r) => {
        const estado = txt(r, 'estado')
        const tone = estado === 'ANULADO' ? 'danger' : estado === 'CONFIRMADO' ? 'success' : 'warning'
        return <Badge tone={tone}>{estado || 'BORRADOR'}</Badge>
      }
    },
    { key: 'debe', header: 'Debe', value: (r) => money(num(r, 'totalDebeCent')) },
    { key: 'haber', header: 'Haber', value: (r) => money(num(r, 'totalHaberCent')) }
  ]

  const columnasPeriodos: Column<Fila>[] = [
    { key: 'anio', header: 'Año', value: (r) => num(r, 'anio') },
    { key: 'mes', header: 'Mes', value: (r) => num(r, 'mes') },
    {
      key: 'estado', header: 'Estado',
      render: (r) => <Badge tone={txt(r, 'estado') === 'CERRADO' ? 'warning' : 'success'}>{txt(r, 'estado') || 'ABIERTO'}</Badge>
    },
    { key: 'cerradoEn', header: 'Cerrado en', value: (r) => txt(r, 'cerradoEn') }
  ]

  const columnasDiario: Column<Fila>[] = [
    { key: 'numero', header: 'Asiento', value: (r) => txt(r, 'numero') },
    { key: 'fecha', header: 'Fecha', value: (r) => txt(r, 'fecha') },
    { key: 'cuenta', header: 'Cuenta', value: (r) => txt(r, 'cuenta') || txt(r, 'codigo') },
    { key: 'descripcion', header: 'Descripción', value: (r) => txt(r, 'descripcion') },
    { key: 'debe', header: 'Debe', value: (r) => money(num(r, 'debeCent')) },
    { key: 'haber', header: 'Haber', value: (r) => money(num(r, 'haberCent')) }
  ]

  const columnasMayor: Column<Fila>[] = [
    { key: 'fecha', header: 'Fecha', value: (r) => txt(r, 'fecha') },
    { key: 'numero', header: 'Asiento', value: (r) => txt(r, 'numero') },
    { key: 'descripcion', header: 'Descripción', value: (r) => txt(r, 'descripcion') },
    { key: 'debe', header: 'Debe', value: (r) => money(num(r, 'debeCent')) },
    { key: 'haber', header: 'Haber', value: (r) => money(num(r, 'haberCent')) },
    { key: 'saldo', header: 'Saldo', value: (r) => money(num(r, 'saldoCent')) }
  ]

  const columnasComprobacion: Column<Fila>[] = [
    { key: 'codigo', header: 'Código', value: (r) => txt(r, 'codigo') },
    { key: 'nombre', header: 'Cuenta', value: (r) => txt(r, 'nombre') },
    { key: 'debe', header: 'Debe', value: (r) => money(num(r, 'debeCent')) },
    { key: 'haber', header: 'Haber', value: (r) => money(num(r, 'haberCent')) }
  ]

  const columnasDetalle: Column<Fila>[] = [
    { key: 'codigo', header: 'Código', value: (r) => txt(r, 'codigo') },
    { key: 'nombre', header: 'Concepto', value: (r) => txt(r, 'nombre') || txt(r, 'descripcion') },
    { key: 'debe', header: 'Debe', value: (r) => money(num(r, 'debeCent')) },
    { key: 'haber', header: 'Haber', value: (r) => money(num(r, 'haberCent')) }
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Contabilidad"
        subtitle="Plan de cuentas, asientos, períodos y estados financieros con trazabilidad."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void cargar()} disabled={cargando}>
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </Button>
            <Button size="sm" onClick={() => void integrar()} disabled={guardando}>
              Integrar documentos
            </Button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: 'cuentas', label: 'Plan de cuentas' },
          { id: 'asientos', label: 'Asientos' },
          { id: 'periodos', label: 'Períodos' },
          { id: 'libros', label: 'Libros y balances' }
        ]}
        active={tab}
        onChange={(id) => setTab(id as Pestaña)}
      />

      {cargando && <p className="mb-3 text-xs text-slate-400">Cargando datos…</p>}

      {tab === 'cuentas' && (
        <TabPanel>
          <Card
            title="Plan de cuentas"
            subtitle="Las cuentas con movimiento pueden usarse en las líneas de los asientos."
            actions={<Button size="sm" onClick={() => abrirCuenta()}><Plus size={14} /> Nueva cuenta</Button>}
          >
            <DataTable
              columns={columnasCuentas}
              data={cuentas}
              rowKey={(r) => num(r, 'id')}
              pageSize={10}
              emptyText="No hay cuentas registradas."
              actions={(r) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirCuenta(r)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => cambiarEstadoCuenta(r)}>
                    {bool(r, 'activa') ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              )}
            />
          </Card>
        </TabPanel>
      )}

      {tab === 'asientos' && (
        <TabPanel>
          <Card
            title="Asientos contables"
            subtitle="El total del debe debe igualar el total del haber antes de guardar."
            actions={<Button size="sm" onClick={abrirAsiento}><Plus size={14} /> Nuevo asiento</Button>}
          >
            {cuentasMovimiento.length === 0 && (
              <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
                Cree cuentas activas que acepten movimiento antes de registrar asientos.
              </p>
            )}
            <DataTable
              columns={columnasAsientos}
              data={asientos}
              rowKey={(r) => num(r, 'id')}
              pageSize={10}
              emptyText="No hay asientos registrados."
              actions={(r) => (
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={txt(r, 'estado') === 'CONFIRMADO'}
                    onClick={() => void ejecutar('cont.asiento.confirmar', { id: num(r, 'id'), estado: 'CONFIRMAR' }, 'Asiento confirmado.')}
                  >
                    Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={txt(r, 'estado') === 'ANULADO'}
                    onClick={() => void ejecutar('cont.asiento.anular', { id: num(r, 'id'), estado: 'ANULAR' }, 'Asiento anulado.')}
                  >
                    Anular
                  </Button>
                </div>
              )}
            />
          </Card>
        </TabPanel>
      )}

      {tab === 'periodos' && (
        <TabPanel>
          <Card title="Abrir un período" subtitle="Indique el año y el mes (1–12) del período a abrir.">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <CampoTexto
                label="Año"
                type="number"
                value={valor(formPeriodo, 'anio')}
                placeholder="2026"
                onChange={(v) => setFormPeriodo((p) => actualizar(p, 'anio', v))}
              />
              <CampoTexto
                label="Mes"
                type="number"
                value={valor(formPeriodo, 'mes')}
                placeholder="1"
                onChange={(v) => setFormPeriodo((p) => actualizar(p, 'mes', v))}
              />
              <Button
                className="mb-0 md:mb-[1px]"
                onClick={() => abrirPeriodo(Number(valor(formPeriodo, 'anio')), Number(valor(formPeriodo, 'mes')))}
              >
                Abrir período
              </Button>
            </div>
          </Card>

          <div className="mt-4">
            <Card title="Períodos contables" subtitle="Un período cerrado no admite nuevos movimientos.">
              <DataTable
                columns={columnasPeriodos}
                data={periodos}
                rowKey={(r) => num(r, 'id')}
                pageSize={12}
                emptyText="No hay períodos registrados."
                actions={(r) => (
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void ejecutar('cont.periodo.abrir', { anio: num(r, 'anio'), mes: num(r, 'mes') }, 'Período abierto.')}
                    >
                      Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={txt(r, 'estado') === 'CERRADO'}
                      onClick={() => void ejecutar('cont.periodo.cerrar', { id: num(r, 'id') }, 'Período cerrado.')}
                    >
                      Cerrar
                    </Button>
                  </div>
                )}
              />
            </Card>
          </div>
        </TabPanel>
      )}

      {tab === 'libros' && (
        <TabPanel>
          <Tabs
            tabs={[
              { id: 'diario', label: 'Libro diario' },
              { id: 'mayor', label: 'Mayor' },
              { id: 'comprobacion', label: 'Balance de comprobación' },
              { id: 'resultados', label: 'Estado de resultados' },
              { id: 'balance', label: 'Balance general' }
            ]}
            active={subTab}
            onChange={(id) => setSubTab(id as SubPestaña)}
          />
          {cargandoLibros && <p className="mb-3 text-xs text-slate-400">Cargando informe…</p>}

          {subTab === 'diario' && (
            <Card title="Libro diario" subtitle="Movimientos contables en orden cronológico.">
              <DataTable
                columns={columnasDiario}
                data={libro}
                rowKey={(r) => num(r, 'id') || `${txt(r, 'fecha')}-${txt(r, 'numero')}`}
                emptyText="No hay movimientos."
              />
            </Card>
          )}

          {subTab === 'mayor' && (
            <Card title="Libro mayor" subtitle="Filtrar por cuenta y, opcionalmente, por rango de fechas.">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <CampoSelect
                  label="Cuenta"
                  value={cuentaMayor}
                  options={[{ value: '', label: 'Seleccione…' }, ...opcionesCuentas]}
                  onChange={setCuentaMayor}
                />
                <CampoTexto label="Desde" type="date" value={fechaDesde} onChange={setFechaDesde} />
                <CampoTexto label="Hasta" type="date" value={fechaHasta} onChange={setFechaHasta} />
              </div>
              <DataTable
                columns={columnasMayor}
                data={mayor}
                rowKey={(r) => num(r, 'id') || `${txt(r, 'fecha')}-${txt(r, 'numero')}`}
                emptyText="Sin movimientos para el filtro."
              />
            </Card>
          )}

          {subTab === 'comprobacion' && (
            <Card title="Balance de comprobación" subtitle="Saldos deudores y acreedores por cuenta.">
              <DataTable
                columns={columnasComprobacion}
                data={comprobacion}
                rowKey={(r) => txt(r, 'codigo')}
                emptyText="No hay saldos para mostrar."
              />
            </Card>
          )}

          {subTab === 'resultados' && (
            <Card title="Estado de resultados" subtitle="Ingresos, gastos y resultado del período.">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Ingresos</p>
                  <p className="text-sm font-semibold">{money(resultados?.ingresosCent ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Gastos</p>
                  <p className="text-sm font-semibold">{money(resultados?.gastosCent ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Resultado</p>
                  <p className="text-sm font-semibold">{money(resultados?.resultadoCent ?? 0)}</p>
                </div>
              </div>
              <DataTable
                columns={columnasDetalle}
                data={filas(resultados?.detalle)}
                rowKey={(r) => txt(r, 'codigo') || txt(r, 'nombre')}
                emptyText="Sin detalle."
              />
            </Card>
          )}

          {subTab === 'balance' && (
            <Card title="Balance general" subtitle="Activo, pasivo, patrimonio y resultado.">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Activo</p>
                  <p className="text-sm font-semibold">{money(balance?.activoCent ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Pasivo + patrimonio</p>
                  <p className="text-sm font-semibold">{money(balance?.pasivoMasPatrimonioCent ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Resultado</p>
                  <p className="text-sm font-semibold">{money(balance?.resultadoCent ?? 0)}</p>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Pasivo: {money(balance?.pasivoCent ?? 0)} · Patrimonio: {money(balance?.patrimonioCent ?? 0)}
              </p>
              <DataTable
                columns={columnasDetalle}
                data={filas(balance?.detalle)}
                rowKey={(r) => txt(r, 'codigo') || txt(r, 'nombre')}
                emptyText="Sin detalle."
              />
            </Card>
          )}
        </TabPanel>
      )}

      <Modal
        open={modalCuenta !== ''}
        title={modalCuenta === 'crear' ? 'Nueva cuenta contable' : 'Modificar cuenta contable'}
        onClose={() => setModalCuenta('')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalCuenta('')}>Cancelar</Button>
            <Button onClick={() => void guardarCuenta()} disabled={guardando}>Guardar</Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {modalCuenta === 'crear' && (
            <CampoTexto
              label="Código"
              value={valor(formCuenta, 'codigo')}
              onChange={(v) => setFormCuenta((p) => actualizar(p, 'codigo', v))}
            />
          )}
          <CampoTexto
            label="Nombre"
            value={valor(formCuenta, 'nombre')}
            onChange={(v) => setFormCuenta((p) => actualizar(p, 'nombre', v))}
          />
          <CampoSelect
            label="Tipo"
            value={valor(formCuenta, 'tipo')}
            options={TIPOS_CUENTA.map((v) => ({ value: v, label: v }))}
            onChange={(v) => setFormCuenta((p) => actualizar(p, 'tipo', v))}
          />
          <CampoSelect
            label="Naturaleza"
            value={valor(formCuenta, 'naturaleza')}
            options={NATURALEZAS.map((v) => ({ value: v, label: v }))}
            onChange={(v) => setFormCuenta((p) => actualizar(p, 'naturaleza', v))}
          />
          {modalCuenta === 'editar' && (
            <CampoSelect
              label="Estado"
              value={valor(formCuenta, 'activa')}
              options={[{ value: 'true', label: 'Activa' }, { value: 'false', label: 'Inactiva' }]}
              onChange={(v) => setFormCuenta((p) => actualizar(p, 'activa', v))}
            />
          )}
          <Field label="Acepta movimiento">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={valor(formCuenta, 'aceptaMovimiento') === 'true'}
                onChange={(e) => setFormCuenta((p) => actualizar(p, 'aceptaMovimiento', String(e.target.checked)))}
              />
              Permitir asientos sobre esta cuenta
            </label>
          </Field>
        </div>
      </Modal>

      <Modal
        open={modalAsiento}
        title="Nuevo asiento contable"
        width="max-w-3xl"
        onClose={() => setModalAsiento(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalAsiento(false)}>Cancelar</Button>
            <Button onClick={() => void guardarAsiento()} disabled={guardando || !asientoValido}>Guardar asiento</Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <CampoTexto
            label="Fecha"
            type="date"
            value={valor(formAsiento, 'fecha')}
            onChange={(v) => setFormAsiento((p) => actualizar(p, 'fecha', v))}
          />
          <CampoTexto
            label="Descripción"
            value={valor(formAsiento, 'descripcion')}
            onChange={(v) => setFormAsiento((p) => actualizar(p, 'descripcion', v))}
          />
          <CampoSelect
            label="Tipo"
            value={valor(formAsiento, 'tipo')}
            options={TIPOS_ASIENTO.map((v) => ({ value: v, label: v }))}
            onChange={(v) => setFormAsiento((p) => actualizar(p, 'tipo', v))}
          />
        </div>

        <div className="mt-4 space-y-3">
          {lineas.map((linea, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800 md:grid-cols-[2fr_1fr_1fr_2fr_auto] md:items-end"
            >
              <CampoSelect
                label="Cuenta"
                value={linea.cuentaId}
                options={[{ value: '', label: 'Seleccione…' }, ...opcionesCuentas]}
                onChange={(v) => cambiarLinea(index, 'cuentaId', v)}
              />
              <CampoTexto
                label="Debe (RD$)"
                type="number"
                value={linea.debe}
                onChange={(v) => cambiarLinea(index, 'debe', v)}
              />
              <CampoTexto
                label="Haber (RD$)"
                type="number"
                value={linea.haber}
                onChange={(v) => cambiarLinea(index, 'haber', v)}
              />
              <CampoTexto
                label="Descripción"
                value={linea.descripcion}
                onChange={(v) => cambiarLinea(index, 'descripcion', v)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mb-0 md:mb-[1px]"
                disabled={lineas.length === 1}
                onClick={() => setLineas((prev) => prev.filter((_, i) => i !== index))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button size="sm" variant="secondary" onClick={() => setLineas((prev) => [...prev, lineaVacia()])}>
            <Plus size={14} /> Agregar línea
          </Button>
          <p className="text-sm">
            <span className="text-slate-500">Debe </span><strong>{money(totalDebeCent)}</strong>
            <span className="mx-2 text-slate-400">·</span>
            <span className="text-slate-500">Haber </span><strong>{money(totalHaberCent)}</strong>
          </p>
        </div>
        {!asientoValido && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Seleccione una cuenta y escriba importes iguales en debe y haber para habilitar el guardado.
          </p>
        )}
      </Modal>
    </div>
  )
}

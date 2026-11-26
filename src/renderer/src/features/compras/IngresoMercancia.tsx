import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, Search, Trash2, UserPlus } from 'lucide-react'
import { centavosDesdeDecimal } from '@shared/dinero'
import { can, errorInfo } from '@/app/session'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/Toast'
import { money, number } from '@/lib/format'
import {
  calcularFila, centavos, nuevaLinea, payloadIngreso, primeraLineaIncompleta, totalesCarrito
} from './carrito'
import { PagosEditor } from './ComprasForms'
import {
  clave, formularioVacio, num, txt,
  type CatalogosCompras, type DetalleCompra, type FormularioCompra, type Fila,
  type LineaCompra, type MetodoPago
} from './types'

export type CatalogosIngreso = CatalogosCompras & {
  cargando: boolean
  reload: () => Promise<void>
}

type ResultadoGuardado = { id: number; numero: string; totalCent: number }

interface ProveedorNuevo {
  codigo: string
  nombreComercial: string
  rnc: string
  telefono: string
  direccion: string
  contacto: string
  condicionPagoDias: string
  cuentaBancaria: string
}

const proveedorVacio: ProveedorNuevo = {
  codigo: '', nombreComercial: '', rnc: '', telefono: '', direccion: '',
  contacto: '', condicionPagoDias: '0', cuentaBancaria: ''
}

/** Convierte un detalle ya persistido al formulario, para poder corregirlo. */
function desdeDetalle(detalle: DetalleCompra, catalogos: CatalogosCompras): FormularioCompra {
  const c = detalle.cabecera
  const base = formularioVacio(catalogos, 'FACTURA_COMPRA')
  const cent = (valor: unknown): string => (num(valor) / 100).toFixed(2)
  const pct = (valor: unknown): string => (num(valor) / 100).toFixed(2)
  return {
    ...base,
    proveedorId: txt(c.proveedorId),
    almacenId: txt(c.almacenId),
    fecha: txt(c.fecha),
    fechaLlegada: txt(c.fechaLlegada),
    vencimiento: txt(c.vencimiento),
    numeroProveedor: txt(c.numeroProveedor),
    numeroOrdenCompra: txt(c.numeroOrdenCompra),
    clasificacionContable: txt(c.clasificacionContable) || '1200',
    monedaCodigo: txt(c.monedaCodigo) || 'DOP',
    tasa: String(num(c.tasaAplicada) || 1),
    montoFactura: cent(c.montoFacturaCent),
    montoFacturaMoneda: cent(c.montoFacturaMonedaCent),
    ajuste: cent(c.ajusteCent),
    flete: cent(c.fleteCent),
    nota: txt(c.nota),
    comentarios: txt(c.comentarios),
    credito: txt(c.condicion).toUpperCase() === 'CREDITO',
    lineas: detalle.lineas.map((linea) => ({
      key: clave(),
      productoId: txt(linea.productoId),
      docLineaId: txt(linea.id),
      cantidad: String(num(linea.cantidad)),
      costo: cent(linea.precioCent),
      pvs: cent(linea.pvsCent),
      referencia: txt(linea.referencia),
      descuentoPct: pct(linea.descuentoPctBp),
      descuento2Pct: pct(linea.descuento2PctBp),
      descuento3Pct: pct(linea.descuento3PctBp),
      gasto: cent(linea.gastoCent),
      impuestoId: txt(linea.impuestoId),
      exento: Boolean(linea.exento),
      numeroSerie: txt(linea.numeroSerie),
      lote: txt(linea.lote)
    })),
    pagos: detalle.pagos.map((pago) => ({
      key: clave(),
      metodo: txt(pago.metodo) as MetodoPago,
      monto: cent(pago.montoCent),
      referencia: txt(pago.referencia)
    }))
  }
}

/**
 * Ingreso de mercancía: cabecera, documentos, totalización, buscador y tabla de
 * productos en una sola pantalla. Todos los totales salen del motor compartido.
 */
export function IngresoMercancia({
  catalogos, editarId, onEditarTerminado, onGuardado
}: {
  catalogos: CatalogosIngreso
  editarId?: number | null
  onEditarTerminado?: () => void
  onGuardado?: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<FormularioCompra>(() => formularioVacio(catalogos, 'FACTURA_COMPRA'))
  const [inicial, setInicial] = useState(() => JSON.stringify(formularioVacio(catalogos, 'FACTURA_COMPRA')))
  const [estado, setEstado] = useState('BORRADOR')
  const [numero, setNumero] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [indice, setIndice] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [proveedorBusqueda, setProveedorBusqueda] = useState('')
  const [proveedorModal, setProveedorModal] = useState(false)
  const [nuevoProveedor, setNuevoProveedor] = useState<ProveedorNuevo>(proveedorVacio)

  const buscadorRef = useRef<HTMLInputElement>(null)
  const cantRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const costoRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const agregarRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    if (!form.almacenId && catalogos.almacenes.length) {
      setForm((f) => ({ ...f, almacenId: String(catalogos.almacenes[0].id) }))
    }
  }, [catalogos.almacenes, form.almacenId])

  useEffect(() => {
    if (!editarId) return
    let activo = true
    void (async () => {
      try {
        const detalle = await window.api.invoke<DetalleCompra>('compras.detalle', editarId)
        if (!activo) return
        const cargado = desdeDetalle(detalle, catalogos)
        setForm(cargado)
        setInicial(JSON.stringify(cargado))
        setEstado(txt(detalle.cabecera.estado))
        setNumero(txt(detalle.cabecera.numero))
        setBusqueda('')
      } catch (error) {
        toast.error(errorInfo(error).message)
      }
    })()
    return () => { activo = false }
  }, [editarId, catalogos])

  function actualizar(cambios: Partial<FormularioCompra>): void {
    setForm((f) => ({ ...f, ...cambios }))
  }

  function reiniciar(): void {
    const limpio = formularioVacio(catalogos, 'FACTURA_COMPRA')
    limpio.almacenId = form.almacenId
    setForm(limpio)
    setInicial(JSON.stringify(limpio))
    setEstado('BORRADOR')
    setNumero('')
    setBusqueda('')
    setIndice(0)
    onEditarTerminado?.()
  }

  function cancelar(): void {
    const sucio = JSON.stringify(form) !== inicial
    if (sucio && !window.confirm('Hay cambios sin guardar. ¿Desea descartarlos?')) return
    reiniciar()
  }

  const proveedor = catalogos.proveedores.find((p) => String(p.id) === form.proveedorId)
  const proveedoresFiltrados = useMemo(() => {
    const query = proveedorBusqueda.trim().toLowerCase()
    const lista = catalogos.proveedores.filter((p) =>
      !query || [txt(p.codigo), txt(p.nombreComercial), txt(p.rnc)]
        .some((valor) => valor.toLowerCase().includes(query))
    )
    return lista.slice(0, 8)
  }, [catalogos.proveedores, proveedorBusqueda])

  const resultados = useMemo(() => {
    const query = busqueda.trim().toLowerCase()
    if (!query) return []
    return catalogos.productos.filter((p) =>
      [txt(p.codigo), txt(p.descripcion), txt(p.referencia)]
        .some((valor) => valor.toLowerCase().includes(query))
    ).slice(0, 12)
  }, [busqueda, catalogos.productos])

  const totales = useMemo(() => totalesCarrito(catalogos, form.lineas, {
    fleteCent: centavos(form.flete),
    ajusteCent: centavosDesdeDecimal(Number(form.ajuste) || 0),
    montoFacturaCent: form.montoFactura ? centavos(form.montoFactura) : undefined
  }), [catalogos, form.lineas, form.flete, form.ajuste, form.montoFactura])

  function agregarProducto(productoId: string): void {
    const linea = nuevaLinea(catalogos, productoId)
    actualizar({ lineas: [...form.lineas, linea] })
    setBusqueda('')
    setIndice(0)
    window.requestAnimationFrame(() => cantRefs.current[linea.key]?.focus())
  }

  function tecleaBuscador(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndice((i) => Math.min(i + 1, Math.max(0, resultados.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndice((i) => Math.max(0, i - 1))
    } else if (event.key === 'Escape') {
      setBusqueda('')
      setIndice(0)
    } else if (event.key === 'Enter' && resultados.length) {
      event.preventDefault()
      agregarProducto(String(resultados[Math.min(indice, resultados.length - 1)].id))
    }
  }

  /** Enter encadena Cantidad → Costo → Agregar → Buscador. */
  function tecleaLinea(
    event: KeyboardEvent<HTMLElement>, linea: LineaCompra, campo: 'cantidad' | 'costo' | 'agregar'
  ): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (campo === 'cantidad') costoRefs.current[linea.key]?.focus()
    else if (campo === 'costo') agregarRefs.current[linea.key]?.focus()
    else buscadorRef.current?.focus()
  }

  function guardar(): void {
    if (!form.proveedorId) { toast.warning('Seleccione el proveedor.'); return }
    if (!form.lineas.length || primeraLineaIncompleta(form.lineas)) {
      toast.warning('Complete o elimine las líneas incompletas.'); return
    }
    if (totales.totalCent <= 0) { toast.warning('El total del ingreso debe ser mayor que cero.'); return }
    if (editarId && form.motivo.trim().length < 3) {
      toast.warning('Indique el motivo de la corrección.'); return
    }
    if (!form.credito) {
      const pagado = form.pagos.reduce((suma, pago) => suma + centavosDesdeDecimal(Number(pago.monto) || 0), 0)
      if (pagado !== totales.totalCent) {
        toast.warning(`Los pagos deben sumar ${money(totales.totalCent)}.`); return
      }
    }

    setGuardando(true)
    void (async () => {
      try {
        const payload = payloadIngreso(form, totales.totalCent)
        const resultado = editarId
          ? await window.api.invoke<ResultadoGuardado>('compras.ingreso.editar', {
            ...payload, id: editarId, motivo: form.motivo.trim()
          })
          : await window.api.invoke<ResultadoGuardado>('compras.ingreso.crear', payload)
        setEstado('CONTABILIZADO')
        setNumero(resultado.numero)
        setInicial(JSON.stringify(form))
        toast.success(`Ingreso ${resultado.numero} guardado; stock, CxP y contabilidad actualizados.`)
        onGuardado?.()
        if (!editarId) {
          onEditarTerminado?.()
          reiniciarSinAviso()
        }
      } catch (error) {
        toast.error(errorInfo(error).message)
      } finally {
        setGuardando(false)
      }
    })()
  }

  function reiniciarSinAviso(): void {
    const limpio = formularioVacio(catalogos, 'FACTURA_COMPRA')
    limpio.almacenId = form.almacenId
    setForm(limpio)
    setInicial(JSON.stringify(limpio))
    setEstado('BORRADOR')
    setNumero('')
    setBusqueda('')
    setIndice(0)
  }

  async function guardarProveedor(): Promise<void> {
    if (!nuevoProveedor.codigo.trim() || !nuevoProveedor.nombreComercial.trim()) {
      toast.warning('Código y nombre comercial son obligatorios.'); return
    }
    try {
      await window.api.invoke('maestros.save', {
        entidad: 'proveedores',
        data: {
          codigo: nuevoProveedor.codigo.trim(),
          nombreComercial: nuevoProveedor.nombreComercial.trim(),
          razonSocial: nuevoProveedor.nombreComercial.trim(),
          rnc: nuevoProveedor.rnc.trim(),
          telefono: nuevoProveedor.telefono.trim(),
          direccion: nuevoProveedor.direccion.trim(),
          contacto: nuevoProveedor.contacto.trim(),
          condicionPagoDias: Number(nuevoProveedor.condicionPagoDias) || 0,
          cuentaBancaria: nuevoProveedor.cuentaBancaria.trim(),
          observaciones: '',
          activo: true
        }
      })
      await catalogos.reload()
      const filas = await window.api.invoke<Fila[]>('maestros.list', { entidad: 'proveedores' })
      const creado = filas.find((f) => txt(f.codigo) === nuevoProveedor.codigo.trim())
      if (creado) actualizar({ proveedorId: String(num(creado.id)) })
      setProveedorModal(false)
      setNuevoProveedor(proveedorVacio)
      setProveedorBusqueda('')
      toast.success('Proveedor creado y seleccionado.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  function tasaVigente(): number | undefined {
    const fecha = form.fecha || new Date().toISOString().slice(0, 10)
    const tasas = [...(catalogos.tasasCambio ?? [])]
      .filter((t) => txt(t.monedaCodigo) === form.monedaCodigo && txt(t.fecha) <= fecha)
      .sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha)))
    return tasas[0] ? Number(tasas[0].tasa) : undefined
  }

  function aplicarTasaVigente(): void {
    const tasa = tasaVigente()
    if (tasa) actualizar({ tasa: String(tasa) })
  }

  const sucio = JSON.stringify(form) !== inicial
  const puedeEditarCosto = can('compras.costo')
  const puedeDescuento = can('compras.descuento')

  return (
    <>
      <PageHeader
        title="Ingreso de Mercancía"
        subtitle={numero ? `Documento ${numero} · ${estado}` : 'Registro de compras con stock, CxP y contabilidad reales.'}
        actions={
          <>
            <Badge tone={estado === 'ANULADO' ? 'danger' : estado === 'BORRADOR' ? 'warning' : 'success'}>
              {sucio && estado !== 'BORRADOR' ? 'BORRADOR (cambios)' : estado}
            </Badge>
            <Button variant="secondary" onClick={cancelar} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando || catalogos.cargando}>
              {guardando ? 'Guardando…' : editarId ? 'Guardar corrección' : 'Guardar ingreso'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-3" title="Proveedor" subtitle="Búsqueda por nombre, RNC o código">
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <TextInput
                className="pl-8"
                placeholder="Buscar proveedor…"
                value={proveedorBusqueda}
                onChange={(e) => setProveedorBusqueda(e.target.value)}
                aria-label="Buscar proveedor"
              />
              {proveedorBusqueda && proveedoresFiltrados.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {proveedoresFiltrados.map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => {
                        actualizar({ proveedorId: String(p.id) })
                        setProveedorBusqueda('')
                      }}
                    >
                      <span className="font-medium">{txt(p.nombreComercial)}</span>
                      <span className="text-slate-500">{txt(p.codigo)} · RNC {txt(p.rnc) || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {proveedor ? (
              <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
                <p className="text-sm font-semibold">{txt(proveedor.nombreComercial)}</p>
                <p className="text-slate-500">Código: {txt(proveedor.codigo) || '—'}</p>
                <p className="text-slate-500">RNC: {txt(proveedor.rnc) || '—'}</p>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500">Referencia crediticia</span>
                  <span className="font-medium tabular-nums">{money(num(proveedor.balanceCent))}</span>
                </div>
                <p className="mt-1 text-slate-500">Condición: {num(proveedor.condicionPagoDias)} días</p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400 dark:border-slate-700">
                Seleccione un proveedor para ver su referencia crediticia.
              </p>
            )}

            {can('proveedores.crear') && (
              <Button variant="secondary" className="w-full" onClick={() => setProveedorModal(true)}>
                <UserPlus size={14} /> Nuevo proveedor
              </Button>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-5" title="Documentos" subtitle="Datos de la factura recibida">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha contable *">
              <TextInput type="date" value={form.fecha} onChange={(e) => actualizar({ fecha: e.target.value })} />
            </Field>
            <Field label="Fecha de llegada">
              <TextInput type="date" value={form.fechaLlegada} onChange={(e) => actualizar({ fechaLlegada: e.target.value })} />
            </Field>
            <Field label="Factura / NCF del proveedor" hint="Nunca se genera automáticamente; se valida duplicado.">
              <TextInput value={form.numeroProveedor} maxLength={60}
                onChange={(e) => actualizar({ numeroProveedor: e.target.value })}
                placeholder="Ej. B0100000001" />
            </Field>
            <Field label="Orden de compra">
              <TextInput value={form.numeroOrdenCompra} maxLength={60}
                onChange={(e) => actualizar({ numeroOrdenCompra: e.target.value })}
                placeholder="Referencia del comprador" />
            </Field>
            <Field label="Moneda">
              <div className="flex gap-2">
                <select className={inputClass} value={form.monedaCodigo}
                  onChange={(e) => {
                    const codigo = e.target.value
                    actualizar({ monedaCodigo: codigo, tasa: codigo === (catalogos.monedaBase ?? 'DOP') ? '1' : form.tasa })
                  }}
                  aria-label="Moneda">
                  {(catalogos.monedas ?? []).map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.codigo} · {m.nombre}</option>
                  ))}
                </select>
                {can('compras.tasa') && form.monedaCodigo !== (catalogos.monedaBase ?? 'DOP') && (
                  <Button variant="ghost" title="Usar tasa vigente" onClick={aplicarTasaVigente}>Tasa vigente</Button>
                )}
              </div>
            </Field>
            <Field label="Tasa de cambio" hint="Unidades de moneda base por unidad de esta moneda.">
              <TextInput type="number" inputMode="decimal" step="0.0001" min="0" value={form.tasa}
                disabled={!can('compras.tasa') || form.monedaCodigo === (catalogos.monedaBase ?? 'DOP')}
                onChange={(e) => actualizar({ tasa: e.target.value })} />
            </Field>
            <Field label="Monto factura (moneda del proveedor)">
              <TextInput type="number" inputMode="decimal" step="0.01" min="0"
                value={form.montoFacturaMoneda}
                onChange={(e) => actualizar({ montoFacturaMoneda: e.target.value })}
                placeholder="Si se omite, se calcula" />
            </Field>
            <Field label="Clasificación contable">
              <select className={inputClass} value={form.clasificacionContable}
                onChange={(e) => actualizar({ clasificacionContable: e.target.value })}
                aria-label="Clasificación contable">
                {(catalogos.clasificacionesContables ?? []).map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Almacén">
              <select className={inputClass} value={form.almacenId}
                disabled={!can('compras.almacen')}
                onChange={(e) => actualizar({ almacenId: e.target.value })}
                aria-label="Almacén">
                <option value="">Predeterminado</option>
                {catalogos.almacenes.map((almacen) => (
                  <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
                ))}
              </select>
            </Field>
            {form.credito && (
              <Field label="Vencimiento">
                <TextInput type="date" value={form.vencimiento}
                  onChange={(e) => actualizar({ vencimiento: e.target.value })} />
              </Field>
            )}
            <Field label="Nota" className="sm:col-span-2">
              <TextInput value={form.nota} maxLength={1000}
                onChange={(e) => actualizar({ nota: e.target.value })}
                placeholder="Nota interna del ingreso" />
            </Field>
          </div>

          <div className="mt-3 flex gap-2">
            {([false, true] as boolean[]).map((credito) => (
              <button key={String(credito)} onClick={() => actualizar({ credito })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${form.credito === credito
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}>
                {credito ? 'Crédito (CxP)' : 'Contado'}
              </button>
            ))}
          </div>

          {editarId && (
            <div className="mt-3">
              <Field label="Motivo de la corrección *">
                <TextInput value={form.motivo} maxLength={300}
                  onChange={(e) => actualizar({ motivo: e.target.value })}
                  placeholder="Explique qué se está corrigiendo" />
              </Field>
            </div>
          )}

          {!form.credito && (
            <div className="mt-4">
              <PagosEditor totalCent={totales.totalCent} pagos={form.pagos}
                onChange={(pagos) => actualizar({ pagos })} />
            </div>
          )}
          {form.credito && (
            <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              El ingreso a crédito genera un cargo real en Cuentas por Pagar. No se registra pago automático.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-4" title="Totalización" subtitle="Cálculo automático, sin editar importes">
          <div className="space-y-1.5 text-sm">
            <FilaTotal etiqueta="Bruto" valor={totales.subtotalCent} />
            <FilaTotal etiqueta="Descuento 1" valor={-totales.descuento1Cent} />
            <FilaTotal etiqueta="Descuento 2" valor={-totales.descuento2Cent} />
            <FilaTotal etiqueta="Desc. ítems" valor={-totales.descuento3Cent} />
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-slate-500" htmlFor="flete-ingreso">Flete</label>
              <TextInput id="flete-ingreso" className="h-7 w-28 text-right" type="number" inputMode="decimal"
                step="0.01" min="0" value={form.flete}
                onChange={(e) => actualizar({ flete: e.target.value })} />
            </div>
            <FilaTotal etiqueta="Exento" valor={totales.exentoCent} />
            <FilaTotal etiqueta="Base imponible" valor={totales.gravadoCent} />
            {totales.impuestosPorTasa.map((grupo) => (
              <FilaTotal
                key={`${grupo.codigo}-${grupo.tasaBp}-${grupo.exento ? 'E' : 'G'}`}
                etiqueta={`${grupo.codigo || 'ITBIS'} ${number(grupo.tasaBp / 100)}% (base ${money(grupo.baseCent)})`}
                valor={grupo.impuestoCent}
              />
            ))}
            <FilaTotal etiqueta="ITBIS" valor={totales.impuestoCent} />
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-slate-500" htmlFor="ajuste-ingreso">Ajuste</label>
              <TextInput id="ajuste-ingreso" className="h-7 w-28 text-right" type="number" inputMode="decimal"
                step="0.01" value={form.ajuste}
                onChange={(e) => actualizar({ ajuste: e.target.value })} />
            </div>
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold dark:border-slate-700">
              <span>Total neto</span><span className="tabular-nums">{money(totales.totalCent)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="text-xs text-slate-500" htmlFor="monto-factura-ingreso">
                Monto factura (moneda base)
              </label>
              <TextInput id="monto-factura-ingreso" className="h-7 w-28 text-right" type="number"
                inputMode="decimal" step="0.01" min="0" value={form.montoFactura}
                onChange={(e) => actualizar({ montoFactura: e.target.value })}
                placeholder="Igual al total" />
            </div>
            <div className="flex justify-between text-xs">
              <span>Diferencia</span>
              <span className={`tabular-nums ${totales.diferenciaCent ? 'text-amber-600' : 'text-emerald-600'}`}>
                {money(totales.diferenciaCent)}
              </span>
            </div>
            <Field label="Comentarios" className="pt-2">
              <TextInput value={form.comentarios} maxLength={500}
                onChange={(e) => actualizar({ comentarios: e.target.value })}
                placeholder="Observaciones del documento" />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="Productos" subtitle={`${form.lineas.length} línea(s) · busque y pulse Enter para agregar`}>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            ref={buscadorRef}
            className={`${inputClass} pl-9`}
            placeholder="Buscar por código, descripción o referencia… (↑ ↓ Enter Esc)"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setIndice(0) }}
            onKeyDown={tecleaBuscador}
            aria-label="Buscador de productos"
          />
          {busqueda && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {resultados.length === 0 && (
                <p className="px-3 py-2 text-xs text-slate-400">Sin coincidencias.</p>
              )}
              {resultados.map((producto, i) => (
                <button
                  key={producto.id}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                    i === indice ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onMouseEnter={() => setIndice(i)}
                  onClick={() => agregarProducto(String(producto.id))}
                >
                  <span className="font-medium">{txt(producto.descripcion)}</span>
                  <span className="text-slate-500">{txt(producto.codigo)} · {money(num(producto.costoUltimaCompraCent) || num(producto.costoPromedioCent))}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[1250px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="w-16 px-2 py-2">Orden #</th>
                <th className="w-24 px-2 py-2">Código</th>
                <th className="px-2 py-2">Descripción</th>
                <th className="w-32 px-2 py-2">Referencia</th>
                <th className="w-20 px-2 py-2">Cant</th>
                <th className="w-28 px-2 py-2">PVS</th>
                <th className="w-28 px-2 py-2">Costo</th>
                <th className="w-20 px-2 py-2">Desc1</th>
                <th className="w-20 px-2 py-2">Desc2</th>
                <th className="w-20 px-2 py-2">Desc3</th>
                <th className="w-28 px-2 py-2 text-right">Sub-total</th>
                <th className="w-40 px-2 py-2 text-right">I.V.A.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {form.lineas.map((linea, i) => {
                const producto = catalogos.productos.find((p) => String(p.id) === linea.productoId)
                const calculo = calcularFila(catalogos, linea)
                const cambiar = (cambios: Partial<LineaCompra>): void => {
                  setForm((f) => ({
                    ...f,
                    lineas: f.lineas.map((l) => (l.key === linea.key ? { ...l, ...cambios } : l))
                  }))
                }
                return (
                  <tr key={linea.key}>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-medium tabular-nums">{i + 1}</span>
                        <button
                          className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          onClick={() => setForm((f) => ({ ...f, lineas: f.lineas.filter((l) => l.key !== linea.key) }))}
                          aria-label="Quitar línea"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={`${inputClass} h-8 px-1 text-[11px]`}
                        value={linea.productoId}
                        onChange={(e) => {
                          const id = e.target.value
                          const base = nuevaLinea(catalogos, id)
                          cambiar({
                            productoId: id, referencia: base.referencia, costo: base.costo,
                            pvs: base.pvs, impuestoId: base.impuestoId, exento: base.exento
                          })
                        }}
                        aria-label="Código de producto"
                      >
                        <option value="">Código…</option>
                        {catalogos.productos.map((p) => (
                          <option key={p.id} value={p.id}>{txt(p.codigo)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5" title={txt(producto?.descripcion)}>
                      <span className="block max-w-[260px] truncate font-medium">{txt(producto?.descripcion) || 'Producto no disponible'}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={`${inputClass} h-8 px-2`} value={linea.referencia}
                        onChange={(e) => cambiar({ referencia: e.target.value })}
                        aria-label="Referencia" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        ref={(el) => { cantRefs.current[linea.key] = el }}
                        className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal"
                        value={linea.cantidad}
                        onChange={(e) => cambiar({ cantidad: e.target.value })}
                        onKeyDown={(e) => tecleaLinea(e, linea, 'cantidad')}
                        aria-label="Cantidad" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal"
                        value={linea.pvs} onChange={(e) => cambiar({ pvs: e.target.value })}
                        aria-label="PVS" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        ref={(el) => { costoRefs.current[linea.key] = el }}
                        className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal"
                        value={linea.costo} disabled={!puedeEditarCosto}
                        onChange={(e) => cambiar({ costo: e.target.value })}
                        onKeyDown={(e) => tecleaLinea(e, linea, 'costo')}
                        aria-label="Costo" />
                    </td>
                    {(['descuentoPct', 'descuento2Pct', 'descuento3Pct'] as const).map((campo) => (
                      <td className="px-2 py-1.5" key={campo}>
                        <input className={`${inputClass} h-8 px-2`} type="text" inputMode="decimal"
                          value={linea[campo]} disabled={!puedeDescuento}
                          onChange={(e) => cambiar({ [campo]: e.target.value })}
                          aria-label={campo} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {money(calculo?.baseCent ?? 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums">{money(calculo?.impuestoCent ?? 0)}</span>
                        <button
                          ref={(el) => { agregarRefs.current[linea.key] = el }}
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700"
                          onClick={() => buscadorRef.current?.focus()}
                          onKeyDown={(e) => tecleaLinea(e, linea, 'agregar')}
                          aria-label="Agregar línea"
                        >
                          Agregar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {form.lineas.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                    Busque un producto y pulse Enter para agregarlo al ingreso.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Enter en Cant → Costo → Agregar → Buscador · Esc limpia la búsqueda.</span>
          <Button size="sm" variant="secondary" onClick={() => actualizar({ lineas: [...form.lineas, nuevaLinea(catalogos)] })}>
            <Plus size={14} /> Línea manual
          </Button>
        </div>
      </Card>

      <Modal
        open={proveedorModal}
        title="Nuevo proveedor"
        subtitle="Se crea sin salir del ingreso; requiere permiso proveedores.crear."
        onClose={() => setProveedorModal(false)}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProveedorModal(false)}>Cancelar</Button>
            <Button onClick={() => void guardarProveedor()}>Guardar proveedor</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código *">
            <TextInput value={nuevoProveedor.codigo}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, codigo: e.target.value })} />
          </Field>
          <Field label="Nombre comercial *">
            <TextInput value={nuevoProveedor.nombreComercial}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombreComercial: e.target.value })} />
          </Field>
          <Field label="RNC">
            <TextInput value={nuevoProveedor.rnc}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, rnc: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <TextInput value={nuevoProveedor.telefono}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, telefono: e.target.value })} />
          </Field>
          <Field label="Contacto">
            <TextInput value={nuevoProveedor.contacto}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, contacto: e.target.value })} />
          </Field>
          <Field label="Condición de pago (días)">
            <TextInput type="number" inputMode="numeric" value={nuevoProveedor.condicionPagoDias}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, condicionPagoDias: e.target.value })} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <TextInput value={nuevoProveedor.direccion}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, direccion: e.target.value })} />
          </Field>
          <Field label="Cuenta bancaria" className="sm:col-span-2">
            <TextInput value={nuevoProveedor.cuentaBancaria}
              onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, cuentaBancaria: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  )
}

function FilaTotal({ etiqueta, valor }: { etiqueta: string; valor: number }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-slate-500">{etiqueta}</span>
      <span className="tabular-nums">{money(valor)}</span>
    </div>
  )
}

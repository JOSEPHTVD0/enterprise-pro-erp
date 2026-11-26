import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Hash, Link2, LogOut, Percent, Plus, Search, Tag, Trash2, XCircle } from 'lucide-react'
import { errorInfo } from '@/app/session'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { money, number } from '@/lib/format'
import { impuestoPorDefecto, nuevaLinea, totalesCarrito } from './carrito'
import {
  clave, num, txt, type CatalogosVentas, type DetalleDocumento, type Fila,
  type FormularioVenta, type LineaCarrito
} from './types'

/**
 * Panel de facturación ECF: distribución densa tipo POS sobre el mismo modelo
 * `FormularioVenta` que usan el modal de facturas, el POS y las cotizaciones.
 * Nada de lo que se muestra aquí se envía directamente al backend: los importes
 * salen de `totalesCarrito` (motor compartido) y el alta usa el mismo
 * `ventas.factura.crear` que el formulario existente.
 */

const ecInput =
  'h-6 w-full min-w-0 rounded-[3px] border border-slate-700 bg-slate-950 px-1.5 text-[11px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 disabled:text-slate-500'
const ecBoton =
  'flex h-[52px] flex-col items-center justify-center gap-1 rounded-[3px] border border-slate-700 bg-slate-800 text-[10px] font-medium text-slate-300 transition-colors hover:border-indigo-500 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

function Campo({ etiqueta, children, className = '' }: {
  etiqueta: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 ${className}`}>
      <span className="text-right text-[11px] leading-tight text-slate-400">{etiqueta}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Entrada({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={`${ecInput} ${className}`} />
}

function fechaATexto(iso: string): string {
  const partes = iso.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : ''
}

interface Props {
  catalogos: CatalogosVentas
  form: FormularioVenta
  onChange: (form: FormularioVenta) => void
  onGuardar: () => void
  onSalir: () => void
  guardando: boolean
  cargando: boolean
  permitirPrecio: boolean
  permitirDescuento: boolean
  tipoFactura: 'FACTURA_CONTADO' | 'FACTURA_CREDITO'
  onTipoFactura: (tipo: 'FACTURA_CONTADO' | 'FACTURA_CREDITO') => void
}

type Editor = 'precio' | 'descuento' | 'cantidad' | null

export function FacturacionEcfPanel({
  catalogos, form, onChange, onGuardar, onSalir, guardando, cargando,
  permitirPrecio, permitirDescuento, tipoFactura, onTipoFactura
}: Props): React.JSX.Element {
  const [moneda, setMoneda] = useState('RD$')
  const [tasa, setTasa] = useState('1.000')
  const [fechaDraft, setFechaDraft] = useState(() => fechaATexto(form.fecha))
  const [clienteCodigo, setClienteCodigo] = useState('')
  const [vendedorCodigo, setVendedorCodigo] = useState('')
  const [direccion, setDireccion] = useState('.')
  const [telefono, setTelefono] = useState('')
  const [celular, setCelular] = useState('')
  const [formaPago, setFormaPago] = useState('Contado')
  const [buscar, setBuscar] = useState('')
  const [descripcionNueva, setDescripcionNueva] = useState('')
  const [cantidadNueva, setCantidadNueva] = useState('1.00')
  const [seleccion, setSeleccion] = useState('')
  const [editor, setEditor] = useState<Editor>(null)
  const [editorValor, setEditorValor] = useState('')
  const [pedidosOpen, setPedidosOpen] = useState(false)
  const [pedidos, setPedidos] = useState<Fila[]>([])

  const guardarRef = useRef(onGuardar)
  useEffect(() => { guardarRef.current = onGuardar }, [onGuardar])

  const cliente = catalogos.clientes.find((c) => String(c.id) === form.clienteId)
  const vendedor = catalogos.vendedores.find((v) => String(v.id) === form.vendedorId)
  const totales = totalesCarrito(catalogos, form.lineas)
  const seleccionada = form.lineas.find((l) => l.key === seleccion) ?? form.lineas[0]
  const filtradas = buscar.trim()
    ? form.lineas.filter((linea) => {
      const producto = catalogos.productos.find((p) => String(p.id) === linea.productoId)
      const texto = `${producto?.codigo ?? ''} ${producto?.descripcion ?? ''}`.toLowerCase()
      return texto.includes(buscar.trim().toLowerCase())
    })
    : form.lineas

  useEffect(() => setFechaDraft(fechaATexto(form.fecha)), [form.fecha])
  useEffect(() => {
    setClienteCodigo(cliente ? (cliente.codigo || String(cliente.id)) : '')
  }, [cliente])
  useEffect(() => {
    setVendedorCodigo(vendedor ? (vendedor.codigo || String(vendedor.id)) : '')
  }, [vendedor])

  useEffect(() => {
    const atajo = (evento: KeyboardEvent): void => {
      if (evento.key === 'F7' && !pedidosOpen) {
        evento.preventDefault()
        guardarRef.current()
      }
    }
    window.addEventListener('keydown', atajo)
    return () => window.removeEventListener('keydown', atajo)
  }, [pedidosOpen])

  function actualizar(cambios: Partial<FormularioVenta>): void {
    onChange({ ...form, ...cambios })
  }

  function actualizarLinea(key: string, cambios: Partial<LineaCarrito>): void {
    actualizar({ lineas: form.lineas.map((l) => (l.key === key ? { ...l, ...cambios } : l)) })
  }

  function resolverCliente(valor: string): void {
    const texto = valor.trim().toLowerCase()
    const encontrado = catalogos.clientes.find((c) =>
      String(c.codigo ?? '').toLowerCase() === texto ||
      String(c.id) === texto ||
      c.nombre.toLowerCase() === texto
    )
    if (encontrado) {
      actualizar({ clienteId: String(encontrado.id) })
      setClienteCodigo(encontrado.codigo || String(encontrado.id))
    }
  }

  function resolverVendedor(valor: string): void {
    const texto = valor.trim().toLowerCase()
    const encontrado = catalogos.vendedores.find((v) =>
      String(v.codigo).toLowerCase() === texto ||
      String(v.id) === texto ||
      v.nombre.toLowerCase() === texto
    )
    if (encontrado) {
      actualizar({ vendedorId: String(encontrado.id) })
      setVendedorCodigo(encontrado.codigo || String(encontrado.id))
    }
  }

  function cambiarFecha(valor: string): void {
    setFechaDraft(valor)
    const coincidencia = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim())
    if (coincidencia) {
      actualizar({ fecha: `${coincidencia[3]}-${coincidencia[2]}-${coincidencia[1]}` })
    }
  }

  function asignarProducto(linea: LineaCarrito, productoId: string): void {
    const producto = catalogos.productos.find((p) => String(p.id) === productoId)
    actualizarLinea(linea.key, {
      productoId,
      precioCent: producto ? (num(producto.precio1Cent) / 100).toFixed(2) : '0.00',
      impuestoId: producto?.impuestoId
        ? String(producto.impuestoId)
        : (impuestoPorDefecto(catalogos)?.toString() ?? '')
    })
  }

  function agregarProducto(): void {
    const texto = descripcionNueva.trim().toLowerCase()
    if (!texto) { toast.warning('Escriba el código o la descripción del producto.'); return }
    const producto = catalogos.productos.find((p) =>
      p.descripcion.toLowerCase() === texto || p.codigo.toLowerCase() === texto || String(p.id) === texto
    ) ?? catalogos.productos.find((p) => p.descripcion.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto))
    if (!producto) { toast.warning('Producto no encontrado en el catálogo activo.'); return }
    const linea = nuevaLinea(catalogos, String(producto.id))
    linea.cantidad = Number(cantidadNueva) > 0 ? cantidadNueva : '1'
    actualizar({ lineas: [...form.lineas, linea] })
    setSeleccion(linea.key)
    setDescripcionNueva('')
    setCantidadNueva('1.00')
  }

  function abrirEditor(tipo: Exclude<Editor, null>): void {
    if (!seleccionada) { toast.warning('Agregue una línea antes de editar.'); return }
    const valor = tipo === 'precio' ? seleccionada.precioCent
      : tipo === 'descuento' ? seleccionada.descuentoPct
        : seleccionada.cantidad
    setEditor(tipo)
    setEditorValor(valor)
  }

  function aplicarEditor(): void {
    if (!editor || !seleccionada) return
    const campo = editor === 'precio' ? 'precioCent' : editor === 'descuento' ? 'descuentoPct' : 'cantidad'
    actualizarLinea(seleccionada.key, { [campo]: editorValor })
    setEditor(null)
  }

  function cancelar(): void {
    setEditor(null)
    setEditorValor('')
    setSeleccion('')
    setBuscar('')
    setDescripcionNueva('')
    setCantidadNueva('1.00')
  }

  function borrarLinea(): void {
    if (!seleccionada) { toast.warning('No hay una línea seleccionada.'); return }
    actualizar({ lineas: form.lineas.filter((l) => l.key !== seleccionada.key) })
    setSeleccion('')
    setEditor(null)
  }

  async function abrirPedidos(): Promise<void> {
    setPedidosOpen(true)
    try {
      const filas = await window.api.invoke<Fila[]>('cotizaciones.documentos', { tipo: 'PEDIDO' })
      setPedidos(filas ?? [])
    } catch (error) {
      setPedidos([])
      toast.error(errorInfo(error).message)
    }
  }

  async function cargarPedido(id: number): Promise<void> {
    try {
      const detalle = await window.api.invoke<DetalleDocumento>('ventas.detalle', id)
      const lineas: LineaCarrito[] = detalle.lineas.map((linea) => ({
        key: clave(),
        productoId: String(linea.productoId ?? ''),
        cantidad: String(num(linea.cantidad) || 1),
        precioCent: (num(linea.precioCent) / 100).toFixed(2),
        descuentoPct: (num(linea.descuentoPctBp) / 100).toString(),
        impuestoId: linea.impuestoId ? String(linea.impuestoId) : '',
        exento: Boolean(linea.exento),
        numeroSerie: txt(linea.numeroSerie),
        lote: txt(linea.lote)
      }))
      const clienteId = detalle.cabecera.clienteId ? String(detalle.cabecera.clienteId) : form.clienteId
      actualizar({
        clienteId,
        vendedorId: detalle.cabecera.vendedorId ? String(detalle.cabecera.vendedorId) : form.vendedorId,
        comentarios: txt(detalle.cabecera.comentarios),
        lineas
      })
      setPedidosOpen(false)
      setSeleccion('')
      toast.success('Pedido cargado en el carrito.')
    } catch (error) {
      toast.error(errorInfo(error).message)
    }
  }

  const etiquetaEditor = editor === 'precio' ? 'Precio' : editor === 'descuento' ? 'Descuento %' : 'Cantidad'

  return (
    <div className="erp-ecf flex min-h-[640px] flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-slate-200">
      <datalist id="ecf-clientes">
        {catalogos.clientes.map((c) => (
          <option key={c.id} value={c.codigo || String(c.id)}>{c.nombre}</option>
        ))}
      </datalist>
      <datalist id="ecf-vendedores">
        {catalogos.vendedores.map((v) => (
          <option key={v.id} value={v.codigo || String(v.id)}>{v.nombre}</option>
        ))}
      </datalist>
      <datalist id="ecf-productos">
        {catalogos.productos.map((p) => (
          <option key={p.id} value={p.codigo}>{p.descripcion}</option>
        ))}
      </datalist>

      <div className="flex h-7 shrink-0 items-center rounded-[3px] bg-slate-800 px-3 text-[11px] font-semibold tracking-wide text-slate-200">
        {tipoFactura === 'FACTURA_CONTADO' ? '1 - CONTADO' : '2 - CRÉDITO'}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 px-1">
        <h1 className="text-base font-bold tracking-tight text-white">Facturación ECF</h1>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          Moneda
          <select className={`${ecInput} w-20`} value={moneda} onChange={(e) => setMoneda(e.target.value)} aria-label="Moneda">
            <option value="RD$">RD$</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          Tasa
          <Entrada className="w-20 text-right" value={tasa} inputMode="decimal" onChange={(e) => setTasa(e.target.value)} aria-label="Tasa" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          Depósitos
          <select
            className={`${ecInput} w-36`}
            value={form.almacenId}
            onChange={(e) => actualizar({ almacenId: e.target.value })}
            aria-label="Depósitos"
          >
            <option value="">Predeterminado</option>
            {catalogos.almacenes.map((almacen) => (
              <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
          <span>Fecha :</span>
          <Entrada className="w-28 text-center" value={fechaDraft} onChange={(e) => cambiarFecha(e.target.value)} aria-label="Fecha" />
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-[3px] border border-slate-700 bg-slate-800 text-slate-300 hover:border-indigo-500 hover:text-white"
            title="Vincular pedido"
            aria-label="Vincular pedido"
            onClick={() => void abrirPedidos()}
          >
            <Link2 size={13} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-2">
        <section className="col-span-12 flex flex-col gap-1.5 rounded-[3px] border border-slate-800 bg-slate-950/50 p-2 lg:col-span-4">
          <Campo etiqueta="Cliente">
            <div className="flex gap-1.5">
              <Entrada
                list="ecf-clientes"
                className="w-20"
                value={clienteCodigo}
                onChange={(e) => { setClienteCodigo(e.target.value); resolverCliente(e.target.value) }}
                onBlur={() => resolverCliente(clienteCodigo)}
                placeholder="Código"
                aria-label="Código de cliente"
              />
              <Entrada readOnly value={cliente?.rncCedula ?? ''} placeholder="RNC" aria-label="RNC" />
              <Entrada readOnly className="w-24 text-right" value={money(num(cliente?.limiteCreditoCent))} aria-label="Límite de crédito" />
            </div>
          </Campo>
          <Campo etiqueta="Nombre">
            <Entrada readOnly value={cliente?.nombre ?? ''} placeholder="Seleccione un cliente" aria-label="Nombre del cliente" />
          </Campo>
          <Campo etiqueta="Dirección">
            <Entrada value={direccion} onChange={(e) => setDireccion(e.target.value)} aria-label="Dirección" />
          </Campo>
          <Campo etiqueta="Teléfono">
            <div className="flex gap-1.5">
              <Entrada value={telefono} onChange={(e) => setTelefono(e.target.value)} aria-label="Teléfono" />
              <Entrada value={celular} onChange={(e) => setCelular(e.target.value)} aria-label="Celular" />
            </div>
          </Campo>
          <Campo etiqueta="Vendedor" className="mt-1">
            <div className="flex gap-1.5">
              <Entrada
                list="ecf-vendedores"
                className="w-20"
                value={vendedorCodigo}
                onChange={(e) => { setVendedorCodigo(e.target.value); resolverVendedor(e.target.value) }}
                onBlur={() => resolverVendedor(vendedorCodigo)}
                placeholder="Código"
                aria-label="Código de vendedor"
              />
              <Entrada readOnly value={vendedor?.nombre ?? ''} placeholder="Sin vendedor" aria-label="Nombre del vendedor" />
            </div>
          </Campo>
          <Campo etiqueta="Tipo NCF:" className="mt-1">
            <select
              className={ecInput}
              value={tipoFactura}
              onChange={(e) => onTipoFactura(e.target.value as 'FACTURA_CONTADO' | 'FACTURA_CREDITO')}
              title="La condición del documento llega al backend; la serie y el NCF los asigna el servidor."
              aria-label="Tipo NCF"
            >
              <option value="FACTURA_CONTADO">Factura Consumidor Final</option>
              <option value="FACTURA_CREDITO">Factura Fiscal</option>
            </select>
          </Campo>
        </section>

        <section className="col-span-12 flex flex-col gap-2 rounded-[3px] border border-slate-800 bg-slate-950/50 p-2 lg:col-span-4">
          <div className="flex items-center gap-2">
            <span className="rounded-t-[3px] border border-b-0 border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200">Nota</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>
          <textarea
            className={`${ecInput} min-h-[92px] flex-1 resize-none py-1.5 leading-relaxed`}
            value={form.comentarios}
            maxLength={500}
            onChange={(e) => actualizar({ comentarios: e.target.value })}
            placeholder="Nota del documento"
            aria-label="Nota"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-7 rounded-[3px] border border-slate-700 bg-slate-800 px-3 text-[11px] text-slate-200 hover:border-indigo-500 hover:text-white"
              onClick={() => void abrirPedidos()}
            >
              Ver Pedido
            </button>
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
              Forma Pago
              <select
                className={`${ecInput} w-28`}
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                title="Ventas no registra cobros; aplique el recibo desde Cobros."
                aria-label="Forma Pago"
              >
                {['Contado', 'Tarjeta', 'Transferencia', 'Cheque', 'Otro'].map((forma) => (
                  <option key={forma}>{forma}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <aside className="col-span-12 flex flex-col gap-2 lg:col-span-4 lg:row-span-2">
          <div className="rounded-[3px] border border-slate-800 bg-slate-950/70 p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Resumen financiero</p>
            <div className="flex flex-col gap-1.5">
              <Campo etiqueta="Total Bruto:"><Entrada readOnly className="text-right tabular-nums" value={money(totales.subtotalCent)} aria-label="Total Bruto" /></Campo>
              <Campo etiqueta="Descuento 1:">
                <div className="flex gap-1.5">
                  <Entrada
                    className="w-14 text-right"
                    value={seleccionada?.descuentoPct ?? ''}
                    disabled={!permitirDescuento}
                    onChange={(e) => { if (seleccionada) actualizarLinea(seleccionada.key, { descuentoPct: e.target.value }) }}
                    placeholder="%"
                    aria-label="Descuento 1 porcentaje"
                  />
                  <Entrada readOnly className="text-right tabular-nums" value={money(totales.descuento1Cent)} aria-label="Descuento 1" />
                </div>
              </Campo>
              <Campo etiqueta="Descuento 2:">
                <div className="flex gap-1.5">
                  <Entrada readOnly className="w-14 text-right" value="" placeholder="%" title="El documento admite un descuento por línea" aria-label="Descuento 2 porcentaje" />
                  <Entrada readOnly className="text-right tabular-nums" value={money(totales.descuento2Cent + totales.descuento3Cent)} aria-label="Descuento 2" />
                </div>
              </Campo>
              <Campo etiqueta="Desc. Items:"><Entrada readOnly className="text-right tabular-nums" value={money(totales.descuentoCent)} aria-label="Descuento de items" /></Campo>
              <Campo etiqueta="Monto Exento:"><Entrada readOnly className="text-right tabular-nums" value={money(totales.exentoCent)} aria-label="Monto exento" /></Campo>
              <Campo etiqueta="Base Imponible:"><Entrada readOnly className="text-right tabular-nums" value={money(totales.gravadoCent)} aria-label="Base imponible" /></Campo>
              <Campo etiqueta="ITBIS:"><Entrada readOnly className="text-right tabular-nums" value={money(totales.impuestoCent)} aria-label="ITBIS" /></Campo>
              <Campo etiqueta="Total Neto:">
                <p className="text-right text-lg font-bold leading-6 tabular-nums text-indigo-300">{money(totales.totalCent)}</p>
              </Campo>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 rounded-[3px] border border-slate-800 bg-slate-950/70 p-2.5">
            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[3px] bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onGuardar}
              disabled={guardando || cargando}
              title="Guardar factura (F7)"
            >
              <span>Salvar F7</span>
            </button>

            {editor && (
              <div className="flex items-center gap-1.5 rounded-[3px] border border-indigo-700 bg-slate-900 p-1.5">
                <span className="text-[10px] text-slate-400">{etiquetaEditor}</span>
                <Entrada
                  autoFocus
                  className="w-20 text-right"
                  value={editorValor}
                  inputMode="decimal"
                  onChange={(e) => setEditorValor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') aplicarEditor() }}
                  aria-label={etiquetaEditor}
                />
                <button
                  type="button"
                  className="h-6 rounded-[3px] bg-indigo-600 px-2 text-[10px] text-white hover:bg-indigo-500"
                  onClick={aplicarEditor}
                >
                  Aplicar
                </button>
              </div>
            )}

            <div className="grid flex-1 grid-cols-2 gap-2">
              <button type="button" className={ecBoton} onClick={() => abrirEditor('precio')} disabled={!permitirPrecio} title="Editar precio de la línea seleccionada">
                <Tag size={16} /> Precio
              </button>
              <button type="button" className={ecBoton} onClick={() => abrirEditor('descuento')} disabled={!permitirDescuento} title="Editar descuento de la línea seleccionada">
                <Percent size={16} /> Descuento
              </button>
              <button type="button" className={ecBoton} onClick={() => abrirEditor('cantidad')} title="Editar cantidad de la línea seleccionada">
                <Hash size={16} /> Cantidad
              </button>
              <button type="button" className={ecBoton} onClick={cancelar} title="Cancelar la edición actual">
                <XCircle size={16} /> Cancelar
              </button>
              <button type="button" className={ecBoton} onClick={borrarLinea} title="Borrar la línea seleccionada">
                <Trash2 size={16} /> Borrar
              </button>
              <button type="button" className={ecBoton} onClick={onSalir} title="Volver al listado de documentos">
                <LogOut size={16} /> Salir
              </button>
            </div>
          </div>
        </aside>

        <section className="col-span-12 flex min-h-[260px] flex-col gap-2 rounded-[3px] border border-slate-800 bg-slate-950/50 p-2 lg:col-span-8">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-[3px] border border-slate-700 bg-slate-950 px-2">
              <Search size={13} className="text-slate-500" />
              <input
                className="h-6 w-full bg-transparent text-[11px] text-slate-100 outline-none placeholder:text-slate-600"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar"
                aria-label="Buscar en el detalle"
              />
            </div>
            <Entrada
              list="ecf-productos"
              className="w-52"
              value={descripcionNueva}
              onChange={(e) => setDescripcionNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregarProducto() }}
              placeholder="Descripción"
              aria-label="Descripción del producto"
            />
            <Entrada
              className="w-20 text-right"
              value={cantidadNueva}
              inputMode="decimal"
              onChange={(e) => setCantidadNueva(e.target.value)}
              aria-label="Cantidad a agregar"
            />
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-[3px] border border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500 hover:text-white"
              onClick={agregarProducto}
              title="Agregar producto"
              aria-label="Agregar producto"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-[3px] border border-slate-800">
            <table className="w-full min-w-[620px] border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="w-8 px-2 py-1.5 font-medium">#</th>
                  <th className="w-24 px-2 py-1.5 font-medium">Código</th>
                  <th className="px-2 py-1.5 font-medium">Descripción</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">QTY</th>
                  <th className="w-24 px-2 py-1.5 text-right font-medium">Precio</th>
                  <th className="w-28 px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtradas.map((linea) => {
                  const indice = form.lineas.findIndex((l) => l.key === linea.key) + 1
                  const producto = catalogos.productos.find((p) => String(p.id) === linea.productoId)
                  const total = totalesCarrito(catalogos, [linea]).totalCent
                  return (
                    <tr
                      key={linea.key}
                      onClick={() => setSeleccion(linea.key)}
                      className={`cursor-pointer ${seleccionada?.key === linea.key ? 'bg-indigo-950/40' : 'hover:bg-slate-800/60'}`}
                    >
                      <td className="px-2 py-1 text-slate-500">{indice}</td>
                      <td className="px-2 py-1 font-mono text-slate-300">{producto?.codigo ?? '—'}</td>
                      <td className="px-2 py-1">
                        <Entrada
                          list="ecf-productos"
                          className="border-transparent bg-transparent px-1"
                          value={producto?.descripcion ?? ''}
                          onChange={(e) => {
                            const texto = e.target.value.trim().toLowerCase()
                            const encontrado = catalogos.productos.find((p) =>
                              p.descripcion.toLowerCase() === texto || p.codigo.toLowerCase() === texto
                            )
                            if (encontrado) asignarProducto(linea, String(encontrado.id))
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Descripción del producto"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Entrada
                          className="border-transparent bg-transparent px-1 text-right tabular-nums"
                          value={linea.cantidad}
                          inputMode="decimal"
                          onChange={(e) => actualizarLinea(linea.key, { cantidad: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Cantidad"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Entrada
                          className="border-transparent bg-transparent px-1 text-right tabular-nums"
                          value={linea.precioCent}
                          inputMode="decimal"
                          disabled={!permitirPrecio}
                          onChange={(e) => actualizarLinea(linea.key, { precioCent: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Precio"
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums text-slate-100">{money(total)}</td>
                    </tr>
                  )
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      {form.lineas.length ? 'Ningún ítem coincide con la búsqueda.' : 'Agregue productos para iniciar la factura.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 items-center justify-between text-[10px] text-slate-500">
            <span>{form.lineas.length} ítem(s) · QTY total {number(form.lineas.reduce((suma, l) => suma + (Number(l.cantidad) || 0), 0))}</span>
            <span>ITBIS {money(totales.impuestoCent)} · Neto {money(totales.totalCent)}</span>
          </div>
        </section>
      </div>

      <Modal open={pedidosOpen} title="Pedidos pendientes" onClose={() => setPedidosOpen(false)} width="max-w-3xl">
        <div className="space-y-2">
          {pedidos.map((pedido) => (
            <div key={num(pedido.id)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{txt(pedido.numero)} · {txt(pedido.clienteNombre) || 'Sin cliente'}</p>
                <p className="text-xs text-slate-500">{txt(pedido.fecha)} · {money(num(pedido.totalCent))}</p>
              </div>
              <button
                type="button"
                className="rounded border border-indigo-500 px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                onClick={() => void cargarPedido(num(pedido.id))}
              >
                Cargar
              </button>
            </div>
          ))}
          {pedidos.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No hay pedidos pendientes disponibles.</p>}
        </div>
      </Modal>
    </div>
  )
}

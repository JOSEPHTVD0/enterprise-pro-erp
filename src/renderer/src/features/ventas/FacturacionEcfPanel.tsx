import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import {
  FileClock, Hash, Keyboard, Link2, LogOut, PackagePlus, Percent, Plus, ReceiptText,
  Save, Search, StickyNote, Tag, Trash2, UserRound, Wallet, XCircle
} from 'lucide-react'
import { errorInfo } from '@/app/session'
import { useAjustesStore } from '@/app/ajustes-store'
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
  'h-7 w-full min-w-0 rounded-md border border-slate-700/80 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/60 disabled:text-slate-500'
const soloLectura =
  'border-transparent bg-transparent hover:border-transparent focus:border-transparent focus:ring-0'
const ecBoton =
  'flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700/70 bg-slate-800/60 px-2.5 text-[11px] font-medium text-slate-300 transition-all hover:-translate-y-px hover:border-indigo-400/70 hover:bg-slate-700/70 hover:text-white active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0'
const tarjeta = 'rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 shadow-lg shadow-black/10'

function Entrada({ className = '', readOnly, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      {...props}
      readOnly={readOnly}
      className={`${ecInput} ${readOnly ? soloLectura : ''} ${className}`}
    />
  )
}

function Campo({ etiqueta, children, className = '' }: {
  etiqueta: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={`grid grid-cols-[82px_minmax(0,1fr)] items-center gap-2 ${className}`}>
      <span className="text-right text-[10px] font-medium uppercase leading-tight tracking-wide text-slate-500">
        {etiqueta}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Tarjeta({ titulo, icono, children, className = '', accesorio }: {
  titulo: string
  icono: ReactNode
  children: ReactNode
  className?: string
  accesorio?: ReactNode
}): React.JSX.Element {
  return (
    <section className={`${tarjeta} ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-400/20">
          {icono}
        </span>
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">{titulo}</h2>
        <div className="ml-auto flex items-center gap-2">
          {accesorio}
          <span className="h-px w-8 bg-slate-700/70" />
        </div>
      </div>
      {children}
    </section>
  )
}

function FilaResumen({ etiqueta, children, destacado = false }: {
  etiqueta: string
  children: ReactNode
  destacado?: boolean
}): React.JSX.Element {
  if (destacado) {
    return (
      <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-500/15 to-transparent px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-200">{etiqueta}</span>
        <span className="text-xl font-bold tabular-nums tracking-tight text-white">{children}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 py-1.5 last:border-0">
      <span className="text-[11px] text-slate-400">{etiqueta}</span>
      <div className="flex w-[132px] shrink-0 items-center justify-end gap-1.5">{children}</div>
    </div>
  )
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
  onGuardarBorrador: () => void
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
  catalogos, form, onChange, onGuardar, onGuardarBorrador, onSalir, guardando, cargando,
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
  const dgiVisual = useAjustesStore((s) => s.ajustes.dgiEnlace)

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
    <div className="erp-ecf flex min-h-[640px] flex-col gap-3 rounded-xl border border-slate-800/80 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-3 text-slate-200 shadow-2xl shadow-black/20">
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

      <div className="flex items-center gap-2.5 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 shadow-inner shadow-black/10">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
          {tipoFactura === 'FACTURA_CONTADO' ? '1 - CONTADO' : '2 - CRÉDITO'}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
          <Keyboard size={12} /> F7 guardar
        </span>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3 px-0.5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/20">
            <ReceiptText size={19} />
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-indigo-400">Módulo de ventas</p>
            <h1 className="text-xl font-semibold tracking-tight text-white">Facturación ECF</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Moneda</span>
            <select className={`${ecInput} w-20`} value={moneda} onChange={(e) => setMoneda(e.target.value)} aria-label="Moneda">
              <option value="RD$">RD$</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Tasa</span>
            <Entrada className="w-20 text-right" value={tasa} inputMode="decimal" onChange={(e) => setTasa(e.target.value)} aria-label="Tasa" />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Depósitos</span>
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
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Fecha :</span>
            <Entrada className="w-28 text-center" value={fechaDraft} onChange={(e) => cambiarFecha(e.target.value)} aria-label="Fecha" />
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/70 text-slate-300 transition-colors hover:border-indigo-400 hover:text-white"
              title="Vincular pedido"
              aria-label="Vincular pedido"
              onClick={() => void abrirPedidos()}
            >
              <Link2 size={13} />
            </button>
          </div>
          {dgiVisual?.mostrarPanel !== false && (
            <div
              className="flex max-w-[240px] flex-col rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1"
              title={dgiVisual?.notaInformativa || 'Solo visual: sin envío a DGII ni emisión e-CF.'}
              data-dgi-estado={dgiVisual?.estadoVisual ?? 'SIN_ENLACE'}
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide text-indigo-300">Enlace DGI · visual</span>
              <span className="truncate text-[10px] text-indigo-100">
                {dgiVisual?.estadoVisual ?? 'SIN_ENLACE'} · {dgiVisual?.ambienteVisual ?? 'NO_APLICA'}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
        <div className="col-span-12 flex min-w-0 flex-col gap-3 lg:col-span-8">
          <Tarjeta
            titulo="Cliente"
            icono={<UserRound size={13} />}
            accesorio={
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${cliente ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                {cliente ? 'Activo' : 'Sin cliente'}
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              <Campo etiqueta="Cliente">
                <div className="grid grid-cols-[84px_minmax(0,1fr)_118px] gap-1.5">
                  <Entrada
                    list="ecf-clientes"
                    value={clienteCodigo}
                    onChange={(e) => { setClienteCodigo(e.target.value); resolverCliente(e.target.value) }}
                    onBlur={() => resolverCliente(clienteCodigo)}
                    placeholder="Código"
                    aria-label="Código de cliente"
                  />
                  <Entrada readOnly value={cliente?.rncCedula ?? ''} placeholder="RNC" aria-label="RNC" />
                  <Entrada readOnly className="text-right" value={money(num(cliente?.limiteCreditoCent))} aria-label="Límite de crédito" />
                </div>
              </Campo>
              <Campo etiqueta="Nombre">
                <Entrada readOnly value={cliente?.nombre ?? ''} placeholder="Seleccione un cliente" aria-label="Nombre del cliente" />
              </Campo>
              <Campo etiqueta="Dirección">
                <Entrada value={direccion} onChange={(e) => setDireccion(e.target.value)} aria-label="Dirección" />
              </Campo>
              <Campo etiqueta="Teléfono / Celular" className="grid-cols-[104px_minmax(0,1fr)]">
                <div className="grid grid-cols-2 gap-1.5">
                  <Entrada value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" aria-label="Teléfono" />
                  <Entrada value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="Celular" aria-label="Celular" />
                </div>
              </Campo>
              <Campo etiqueta="Vendedor">
                <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-1.5">
                  <Entrada
                    list="ecf-vendedores"
                    value={vendedorCodigo}
                    onChange={(e) => { setVendedorCodigo(e.target.value); resolverVendedor(e.target.value) }}
                    onBlur={() => resolverVendedor(vendedorCodigo)}
                    placeholder="Código"
                    aria-label="Código de vendedor"
                  />
                  <Entrada readOnly value={vendedor?.nombre ?? ''} placeholder="Sin vendedor" aria-label="Nombre del vendedor" />
                </div>
              </Campo>
              <Campo etiqueta="Tipo NCF">
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
            </div>
          </Tarjeta>

          <Tarjeta titulo="Nota" icono={<StickyNote size={13} />} className="flex flex-1 flex-col">
            <textarea
              className={`${ecInput} h-full min-h-[110px] flex-1 resize-none px-2.5 py-2 leading-relaxed`}
              value={form.comentarios}
              maxLength={500}
              onChange={(e) => actualizar({ comentarios: e.target.value })}
              placeholder="Escriba una nota para el documento…"
              aria-label="Nota"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-md border border-slate-700/70 bg-slate-800/70 px-3 text-[11px] text-slate-200 transition-colors hover:border-indigo-400 hover:text-white"
                onClick={() => void abrirPedidos()}
              >
                <Link2 size={13} /> Ver Pedido
              </button>
              <label className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
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
          </Tarjeta>
        </div>

        <aside className="col-span-12 flex min-w-0 flex-col gap-3 lg:col-span-4 lg:row-span-2">
          <Tarjeta titulo="Resumen" icono={<Wallet size={13} />}>
            <div className="flex flex-col">
              <FilaResumen etiqueta="Total Bruto:">
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.subtotalCent)} aria-label="Total Bruto" />
              </FilaResumen>
              <FilaResumen etiqueta="Descuento 1:">
                <Entrada
                  className="w-12 text-right"
                  value={seleccionada?.descuentoPct ?? ''}
                  disabled={!permitirDescuento}
                  onChange={(e) => { if (seleccionada) actualizarLinea(seleccionada.key, { descuentoPct: e.target.value }) }}
                  placeholder="%"
                  aria-label="Descuento 1 porcentaje"
                />
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.descuento1Cent)} aria-label="Descuento 1" />
              </FilaResumen>
              <FilaResumen etiqueta="Otros descuentos:">
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.descuento2Cent + totales.descuento3Cent)} aria-label="Otros descuentos" />
              </FilaResumen>
              <FilaResumen etiqueta="Desc. Items:">
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.descuentoCent)} aria-label="Descuento de items" />
              </FilaResumen>
              <FilaResumen etiqueta="Monto Exento:">
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.exentoCent)} aria-label="Monto exento" />
              </FilaResumen>
              <FilaResumen etiqueta="Base Imponible:">
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.gravadoCent)} aria-label="Base imponible" />
              </FilaResumen>
              <FilaResumen etiqueta="ITBIS:">
                <Entrada readOnly className="text-right tabular-nums" value={money(totales.impuestoCent)} aria-label="ITBIS" />
              </FilaResumen>
              <FilaResumen etiqueta="Total Neto:" destacado>{money(totales.totalCent)}</FilaResumen>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Acciones" icono={<Keyboard size={13} />} className="flex flex-1 flex-col">
            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition-all hover:-translate-y-px hover:from-indigo-400 hover:to-violet-500 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              onClick={onGuardar}
              disabled={guardando || cargando}
              title="Guardar factura (F7)"
            >
              <Save size={16} /> Salvar F7
            </button>

            <button
              type="button"
              className={ecBoton}
              onClick={onGuardarBorrador}
              disabled={guardando || cargando}
              title="Guardar borrador local sin emitir (no genera NCF ni CxC)"
            >
              <FileClock size={14} /> Guardar borrador
            </button>

            {editor && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/5 p-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{etiquetaEditor}</span>
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
                  className="h-7 rounded-md bg-indigo-600 px-2.5 text-[10px] font-medium text-white transition-colors hover:bg-indigo-500"
                  onClick={aplicarEditor}
                >
                  Aplicar
                </button>
              </div>
            )}

            <div className="mt-2 grid flex-1 grid-cols-2 content-start gap-2">
              <button type="button" className={ecBoton} onClick={() => abrirEditor('precio')} disabled={!permitirPrecio} title="Editar precio de la línea seleccionada">
                <Tag size={15} /> Precio
              </button>
              <button type="button" className={ecBoton} onClick={() => abrirEditor('descuento')} disabled={!permitirDescuento} title="Editar descuento de la línea seleccionada">
                <Percent size={15} /> Descuento
              </button>
              <button type="button" className={ecBoton} onClick={() => abrirEditor('cantidad')} title="Editar cantidad de la línea seleccionada">
                <Hash size={15} /> Cantidad
              </button>
              <button type="button" className={ecBoton} onClick={cancelar} title="Cancelar la edición actual">
                <XCircle size={15} /> Cancelar
              </button>
              <button type="button" className={ecBoton} onClick={borrarLinea} title="Borrar la línea seleccionada">
                <Trash2 size={15} /> Borrar
              </button>
              <button type="button" className={ecBoton} onClick={onSalir} title="Volver al listado de documentos">
                <LogOut size={15} /> Salir
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-600">Los botones editan la línea activa</p>
          </Tarjeta>
        </aside>

        <Tarjeta
          titulo="Detalle de la factura"
          icono={<ReceiptText size={13} />}
          className="col-span-12 min-h-[260px] lg:col-span-8"
          accesorio={
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
              {form.lineas.length} ítem(s)
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 min-w-[170px] flex-1 items-center gap-2 rounded-md border border-slate-700/80 bg-slate-950/80 px-2 transition-colors focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/25">
              <Search size={13} className="shrink-0 text-slate-500" />
              <input
                className="h-full w-full bg-transparent text-[11px] text-slate-100 outline-none placeholder:text-slate-600"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar"
                aria-label="Buscar en el detalle"
              />
            </div>
            <Entrada
              list="ecf-productos"
              className="w-48"
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
              className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white shadow-md shadow-indigo-950/40 transition-colors hover:bg-indigo-500"
              onClick={agregarProducto}
              title="Agregar producto"
              aria-label="Agregar producto"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="mt-2.5 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800/80 bg-slate-950/40">
            <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-slate-800/80 text-[10px] uppercase tracking-wide text-slate-400 backdrop-blur">
                <tr>
                  <th className="w-8 px-2 py-2 font-medium">#</th>
                  <th className="w-24 px-2 py-2 font-medium">Código</th>
                  <th className="px-2 py-2 font-medium">Descripción</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">QTY</th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Precio</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtradas.map((linea) => {
                  const indice = form.lineas.findIndex((l) => l.key === linea.key) + 1
                  const producto = catalogos.productos.find((p) => String(p.id) === linea.productoId)
                  const total = totalesCarrito(catalogos, [linea]).totalCent
                  const activa = seleccionada?.key === linea.key
                  return (
                    <tr
                      key={linea.key}
                      onClick={() => setSeleccion(linea.key)}
                      className={`cursor-pointer transition-colors ${activa ? 'bg-indigo-500/10 shadow-[inset_3px_0_0_0_#818cf8]' : 'odd:bg-white/[0.015] hover:bg-slate-800/50'}`}
                    >
                      <td className="px-2 py-1.5 text-slate-500">{indice}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-300">{producto?.codigo ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        <Entrada
                          list="ecf-productos"
                          className="border-transparent bg-transparent px-1 hover:border-slate-700"
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
                      <td className="px-2 py-1.5">
                        <Entrada
                          className="border-transparent bg-transparent px-1 text-right tabular-nums hover:border-slate-700"
                          value={linea.cantidad}
                          inputMode="decimal"
                          onChange={(e) => actualizarLinea(linea.key, { cantidad: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Cantidad"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Entrada
                          className="border-transparent bg-transparent px-1 text-right tabular-nums hover:border-slate-700"
                          value={linea.precioCent}
                          inputMode="decimal"
                          disabled={!permitirPrecio}
                          onChange={(e) => actualizarLinea(linea.key, { precioCent: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Precio"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-100">{money(total)}</td>
                    </tr>
                  )
                })}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center">
                      <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/70 text-slate-500">
                          <PackagePlus size={18} />
                        </span>
                        <p className="text-[11px] text-slate-400">
                          {form.lineas.length ? 'Ningún ítem coincide con la búsqueda.' : 'Agregue productos para iniciar la factura.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span className="rounded-md bg-slate-800/60 px-2 py-1">
              {form.lineas.length} ítem(s) · QTY total {number(form.lineas.reduce((suma, l) => suma + (Number(l.cantidad) || 0), 0))}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-800/60 px-2 py-1">ITBIS {money(totales.impuestoCent)}</span>
              <span className="rounded-md bg-indigo-500/10 px-2 py-1 text-indigo-200">Neto {money(totales.totalCent)}</span>
            </span>
          </div>
        </Tarjeta>
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

import type { ReactNode } from 'react'
import { Ban, Plus, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, TextInput, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { money } from '@/lib/format'
import {
  centavos, clave, esAnulado, estadosFinanzas, etiquetaFila, num, opciones, pendienteCent, pesos, txt,
  type AplicacionForm, type DetalleFinanzas, type Fila, type FiltroFinanzas
} from './types'

const tonosAccion = {
  normal: 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
  danger: 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30',
  success: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
  info: 'text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30'
}

/** Botón de acción de tabla con etiqueta accesible y tooltip para verificación. */
export function Accion({
  icono, etiqueta, onClick, tono = 'normal', deshabilitado = false
}: {
  icono: ReactNode
  etiqueta: string
  onClick: () => void
  tono?: keyof typeof tonosAccion
  deshabilitado?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`rounded p-1.5 disabled:opacity-40 ${tonosAccion[tono]}`}
      onClick={onClick}
      disabled={deshabilitado}
      title={etiqueta}
      aria-label={etiqueta}
    >
      {icono}
    </button>
  )
}

export function BarraFiltros({
  filtro, onChange, onAplicar, onLimpiar, entidades = [], entidadLabel = 'Entidad',
  estados = estadosFinanzas, extra
}: {
  filtro: FiltroFinanzas
  onChange: (filtro: FiltroFinanzas) => void
  onAplicar: () => void
  onLimpiar: () => void
  entidades?: Fila[]
  entidadLabel?: string
  estados?: string[]
  extra?: { clave: 'cuentaId' | 'cajaId'; etiqueta: string; items: Fila[] }
}): React.JSX.Element {
  return (
    <Card className="mb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Desde">
          <TextInput type="date" value={filtro.desde} onChange={(e) => onChange({ ...filtro, desde: e.target.value })} />
        </Field>
        <Field label="Hasta">
          <TextInput type="date" value={filtro.hasta} onChange={(e) => onChange({ ...filtro, hasta: e.target.value })} />
        </Field>
        <Field label={entidadLabel}>
          <select className={inputClass} value={filtro.entidadId}
            onChange={(e) => onChange({ ...filtro, entidadId: e.target.value })} aria-label={entidadLabel}>
            {opciones(entidades, 'Todas').map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className={inputClass} value={filtro.estado}
            onChange={(e) => onChange({ ...filtro, estado: e.target.value })} aria-label="Estado">
            <option value="">Todos</option>
            {estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
          </select>
        </Field>
        {extra && (
          <Field label={extra.etiqueta}>
            <select className={inputClass} value={filtro[extra.clave]}
              onChange={(e) => onChange({ ...filtro, [extra.clave]: e.target.value })} aria-label={extra.etiqueta}>
              {opciones(extra.items, 'Todas').map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Límite">
          <TextInput type="number" min="1" max="5000" value={filtro.limite}
            onChange={(e) => onChange({ ...filtro, limite: e.target.value })} />
        </Field>
        <div className="flex items-end gap-2 lg:col-span-6">
          <Button variant="ghost" onClick={onLimpiar} title="Limpiar" aria-label="Limpiar">Limpiar</Button>
          <Button variant="secondary" onClick={onAplicar} title="Aplicar filtros" aria-label="Aplicar filtros">Aplicar filtros</Button>
        </div>
      </div>
    </Card>
  )
}

/** Confirmación de anulación con motivo obligatorio (mínimo 3 caracteres). */
export function ModalAnulacion({
  abierto, titulo, descripcion, motivo, onMotivo, onConfirmar, onClose
}: {
  abierto: boolean
  titulo: string
  descripcion?: string
  motivo: string
  onMotivo: (motivo: string) => void
  onConfirmar: (motivo: string) => void
  onClose: () => void
}): React.JSX.Element {
  function confirmar(): void {
    if (motivo.trim().length < 3) {
      toast.warning('Indique el motivo de la anulación (mínimo 3 caracteres).')
      return
    }
    onConfirmar(motivo.trim())
  }

  return (
    <Modal
      open={abierto}
      title={titulo}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} title="Cancelar" aria-label="Cancelar">Cancelar</Button>
          <Button variant="danger" onClick={confirmar} title="Anular" aria-label="Anular">Anular</Button>
        </>
      }
    >
      {descripcion && <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>}
      <Field label="Motivo *" hint="Mínimo 3 caracteres; se conserva en la auditoría.">
        <TextInput value={motivo} maxLength={300} onChange={(e) => onMotivo(e.target.value)}
          placeholder="Explique el motivo" />
      </Field>
    </Modal>
  )
}

function valorCelda(clave: string, valor: unknown): string {
  if (/cent$/i.test(clave)) return money(num(valor))
  return txt(valor) || '—'
}

function TituloSeccion({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>
}

function TablaDetalle({ filas }: { filas: Fila[] }): React.JSX.Element {
  const columnas = Array.from(new Set(filas.flatMap((fila) => Object.keys(fila)))).slice(0, 8)
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>{columnas.map((columna) => <th key={columna} className="whitespace-nowrap px-2 py-2">{columna}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas.map((fila, indice) => (
            <tr key={num(fila.id) || indice}>
              {columnas.map((columna) => (
                <td key={columna} className="max-w-[240px] truncate px-2 py-2">{valorCelda(columna, fila[columna])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Detalle genérico para los documentos de finanzas (cabecera + listas de Fila). */
export function DetalleFinanzasModal({
  detalle, titulo, onClose, onPrint, puedeImprimir = false
}: {
  detalle: DetalleFinanzas | null
  titulo: string
  onClose: () => void
  onPrint?: () => void
  puedeImprimir?: boolean
}): React.JSX.Element | null {
  if (!detalle) return null
  const { cabecera } = detalle
  const secciones: { titulo: string; filas: Fila[] }[] = [
    { titulo: 'Aplicaciones', filas: detalle.aplicaciones ?? [] },
    { titulo: 'Movimientos', filas: detalle.movimientos ?? [] },
    { titulo: 'Recibos', filas: detalle.recibos ?? [] },
    { titulo: 'Pagos', filas: detalle.pagos ?? [] }
  ].filter((seccion) => seccion.filas.length > 0)

  return (
    <Modal
      open
      title={`${titulo} ${txt(cabecera.numeroDocumento) || txt(cabecera.numero) || `#${num(cabecera.id)}`}`}
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} title="Cerrar" aria-label="Cerrar">Cerrar</Button>
          {puedeImprimir && onPrint && (
            <Button onClick={onPrint} title="Imprimir documento" aria-label="Imprimir documento">
              <Printer size={14} /> Imprimir
            </Button>
          )}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {txt(cabecera.estado) && (
          <Badge tone={esAnulado(cabecera) ? 'danger' : 'info'}>{txt(cabecera.estado)}</Badge>
        )}
        <span>Fecha: <strong>{txt(cabecera.fecha) || '—'}</strong></span>
        {txt(cabecera.clienteNombre) && <span>Cliente: <strong>{txt(cabecera.clienteNombre)}</strong></span>}
        {txt(cabecera.proveedorNombre) && <span>Proveedor: <strong>{txt(cabecera.proveedorNombre)}</strong></span>}
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800 sm:grid-cols-3">
        {Object.entries(cabecera)
          .filter(([clave]) => !clave.startsWith('_'))
          .slice(0, 12)
          .map(([clave, valor]) => (
            <div key={clave}>
              <p className="text-[11px] text-slate-500">{clave}</p>
              <p className="font-medium">{valorCelda(clave, valor)}</p>
            </div>
          ))}
      </div>

      {secciones.map((seccion) => (
        <div key={seccion.titulo}>
          <TituloSeccion>{seccion.titulo} ({seccion.filas.length})</TituloSeccion>
          <TablaDetalle filas={seccion.filas} />
        </div>
      ))}
    </Modal>
  )
}

export function SelectorFormato({
  value, onChange, formatos
}: {
  value: string
  onChange: (formato: string) => void
  formatos: string[]
}): React.JSX.Element {
  return (
    <select className={`${inputClass} w-32`} value={value}
      onChange={(e) => onChange(e.target.value)} title="Formato de impresión" aria-label="Formato de impresión">
      {formatos.map((formato) => <option key={formato} value={formato}>{formato}</option>)}
    </select>
  )
}

/** Método de pago y su contraparte: sesión de caja o cuenta bancaria. */
export function SelectorMetodo({
  metodo, onMetodo, metodos, sesiones, cajaSesionId, onCajaSesionId,
  cuentas, bancoCuentaId, onBancoCuentaId, cajaLabel = 'Sesión de caja'
}: {
  metodo: string
  onMetodo: (metodo: string) => void
  metodos: string[]
  sesiones: Fila[]
  cajaSesionId: string
  onCajaSesionId: (id: string) => void
  cuentas: Fila[]
  bancoCuentaId: string
  onBancoCuentaId: (id: string) => void
  cajaLabel?: string
}): React.JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Método">
        <select className={inputClass} value={metodo} onChange={(e) => onMetodo(e.target.value)} aria-label="Método de pago">
          {metodos.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
      </Field>
      {metodo === 'EFECTIVO' ? (
        <Field label={cajaLabel} className="sm:col-span-2">
          <select className={inputClass} value={cajaSesionId}
            onChange={(e) => onCajaSesionId(e.target.value)} aria-label={cajaLabel}>
            {opciones(sesiones, 'Seleccione…').map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Cuenta bancaria" className="sm:col-span-2">
          <select className={inputClass} value={bancoCuentaId}
            onChange={(e) => onBancoCuentaId(e.target.value)} aria-label="Cuenta bancaria">
            {opciones(cuentas, 'Seleccione…').map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  )
}

/** Aplicaciones dinámicas: cada fila elige un documento pendiente y su monto. */
export function AplicacionesEditor({
  documentos, aplicaciones, onChange, montoCent, documentoLabel = 'Documento'
}: {
  documentos: Fila[]
  aplicaciones: AplicacionForm[]
  onChange: (aplicaciones: AplicacionForm[]) => void
  montoCent: number
  documentoLabel?: string
}): React.JSX.Element {
  const aplicado = aplicaciones.reduce((suma, fila) => suma + centavos(fila.monto), 0)
  const diferencia = montoCent - aplicado

  function actualizar(key: string, cambios: Partial<AplicacionForm>): void {
    onChange(aplicaciones.map((fila) => (fila.key === key ? { ...fila, ...cambios } : fila)))
  }

  function elegirDocumento(fila: AplicacionForm, id: string): void {
    const doc = documentos.find((item) => num(item.id) === num(id))
    actualizar(fila.key, {
      documentoId: id,
      monto: doc ? pesos(pendienteCent(doc)) : ''
    })
  }

  function completarResto(): void {
    if (diferencia <= 0 || !aplicaciones.length) return
    const primera = aplicaciones[0]
    actualizar(primera.key, { monto: pesos(centavos(primera.monto) + diferencia) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Aplicaciones a {documentoLabel.toLowerCase()} · {aplicaciones.length}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={completarResto} disabled={diferencia <= 0}
            title="Completar resto" aria-label="Completar resto">
            Completar resto
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => onChange([...aplicaciones, { key: clave(), documentoId: '', monto: '' }])}
            title="Agregar aplicación" aria-label="Agregar aplicación">
            <Plus size={14} /> Agregar aplicación
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2 py-2">{documentoLabel}</th>
              <th className="w-32 px-2 py-2">Pendiente</th>
              <th className="w-32 px-2 py-2">Monto RD$</th>
              <th className="w-9 px-1 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {aplicaciones.map((fila) => {
              const doc = documentos.find((item) => num(item.id) === num(fila.documentoId))
              return (
                <tr key={fila.key}>
                  <td className="px-2 py-1.5">
                    <select className={`${inputClass} h-8`} value={fila.documentoId}
                      onChange={(e) => elegirDocumento(fila, e.target.value)} aria-label={documentoLabel}>
                      <option value="">Seleccione…</option>
                      {documentos.map((item) => (
                        <option key={num(item.id)} value={num(item.id)}>
                          {txt(item.numeroDocumento) || txt(item.numero) || `#${num(item.id)}`} · {money(pendienteCent(item))}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{doc ? money(pendienteCent(doc)) : '—'}</td>
                  <td className="px-2 py-1.5">
                    <input className={`${inputClass} h-8 px-2`} type="number" min="0" step="0.01"
                      value={fila.monto} onChange={(e) => actualizar(fila.key, { monto: e.target.value })}
                      aria-label="Monto aplicado" />
                  </td>
                  <td className="px-1 py-1.5">
                    <button className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      onClick={() => onChange(aplicaciones.filter((item) => item.key !== fila.key))}
                      title="Quitar aplicación" aria-label="Quitar aplicación">
                      <Ban size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {aplicaciones.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-400">Agregue al menos una aplicación.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
        <span className="text-slate-500">Monto: <strong>{money(montoCent)}</strong></span>
        <span className="text-slate-500">Total aplicado: <strong>{money(aplicado)}</strong></span>
        {diferencia !== 0 && (
          <span className={diferencia > 0 ? 'text-amber-600' : 'text-red-600'}>
            {diferencia > 0 ? 'Falta' : 'Sobra'}: {money(Math.abs(diferencia))}
          </span>
        )}
      </div>
    </div>
  )
}

/** Etiqueta reutilizable para las filas de catálogo en los encabezados. */
export function etiqueta(items: Fila[]): string {
  return items.map((item) => etiquetaFila(item)).join(', ')
}

export function AccionAnular({
  onClick, titulo = 'Anular'
}: {
  onClick: () => void
  titulo?: string
}): React.JSX.Element {
  return <Accion icono={<Ban size={15} />} etiqueta={titulo} onClick={onClick} tono="danger" />
}

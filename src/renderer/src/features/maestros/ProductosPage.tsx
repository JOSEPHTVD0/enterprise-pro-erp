import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { MaestroCrud, type CampoDef, type FilaMaestro } from './MaestroCrud'
import type { Column } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { money, number } from '@/lib/format'
import { can, errorInfo } from '@/app/session'
import { toast } from '@/components/ui/Toast'

interface Opcion { id: number; nombre?: string; descripcion?: string }
interface Historial { producto: FilaMaestro; items: Record<string, unknown>[] }

const etiquetasPrecio: Record<string, string> = {
  precio1Cent: 'Precio 1', precio2Cent: 'Precio 2', precio3Cent: 'Precio 3',
  precioMayoristaCent: 'Precio mayorista', precioMinimoCent: 'Precio mínimo',
  costoPromedioCent: 'Costo promedio', costoUltimaCompraCent: 'Última compra'
}

export function ProductosPage(): React.JSX.Element {
  const [categorias, setCategorias] = useState<Opcion[]>([])
  const [marcas, setMarcas] = useState<Opcion[]>([])
  const [unidades, setUnidades] = useState<Opcion[]>([])
  const [impuestos, setImpuestos] = useState<Opcion[]>([])
  const [historial, setHistorial] = useState<Historial | null>(null)
  const verCostos = can('productos.costo')
  const verPrecios = can('productos.precio')

  useEffect(() => {
    for (const [entidad, setter] of [
      ['categorias', setCategorias], ['marcas', setMarcas], ['unidades_medida', setUnidades]
    ] as const) {
      void window.api.invoke<FilaMaestro[]>('maestros.list', { entidad })
        .then(setter)
        .catch(() => { /* sin permiso sobre catálogos */ })
    }
    void window.api.invoke<{ impuestos: Opcion[] }>('config.get')
      .then((cfg) => setImpuestos(cfg.impuestos ?? []))
      .catch(() => { /* sin permiso de configuración */ })
  }, [])

  async function verHistorial(row: FilaMaestro): Promise<void> {
    try {
      const items = await window.api.invoke<Record<string, unknown>[]>('maestros.historial', row.id)
      setHistorial({ producto: row, items })
    } catch (e) { toast.error(errorInfo(e).message) }
  }

  const nombreDe = (lista: Opcion[], id: unknown): string =>
    lista.find((x) => x.id === Number(id))?.nombre ??
      lista.find((x) => x.id === Number(id))?.descripcion ?? '—'

  const columns: Column<FilaMaestro>[] = [
    { key: 'codigo', header: 'Código', value: (r) => String(r.codigo ?? '') },
    { key: 'descripcion', header: 'Descripción', value: (r) => String(r.descripcion ?? '') },
    { key: 'tipo', header: 'Tipo', value: (r) => String(r.tipo ?? '') },
    { key: 'categoria', header: 'Categoría', value: (r) => nombreDe(categorias, r.categoriaId) },
    { key: 'precio1', header: 'Precio 1', value: (r) => verPrecios ? money(Number(r.precio1Cent ?? 0)) : '—' },
    { key: 'minimo', header: 'Mínimo', value: (r) => verPrecios ? money(Number(r.precioMinimoCent ?? 0)) : '—' },
    ...(verCostos
      ? [{ key: 'costo', header: 'Costo prom.', value: (r: FilaMaestro) => money(Number(r.costoPromedioCent ?? 0)) }]
      : []),
    { key: 'existencia', header: 'Mín. exist.', value: (r) => number(r.existenciaMin) }
  ]

  const campos: CampoDef[] = [
    { key: 'codigo', label: 'Código', required: true },
    { key: 'barcode', label: 'Código de barras' },
    { key: 'descripcion', label: 'Descripción', required: true, wide: true },
    { key: 'referencia', label: 'Referencia' },
    { key: 'modelo', label: 'Modelo' },
    { key: 'descripcionExtra', label: 'Descripción adicional', type: 'textarea', wide: true },
    {
      key: 'tipo', label: 'Tipo', type: 'select',
      options: ['FISICO', 'SERVICIO', 'COMPUESTO', 'SERIALIZADO', 'LOTE'].map((v) => ({ value: v, label: v }))
    },
    { key: 'categoriaId', label: 'Categoría', type: 'select', options: categorias.map((c) => ({ value: c.id, label: c.nombre ?? '' })) },
    { key: 'marcaId', label: 'Marca', type: 'select', options: marcas.map((m) => ({ value: m.id, label: m.nombre ?? '' })) },
    { key: 'unidadId', label: 'Unidad de medida', type: 'select', options: unidades.map((u) => ({ value: u.id, label: u.nombre ?? '' })) },
    { key: 'impuestoId', label: 'Impuesto', type: 'select', options: impuestos.map((i) => ({ value: i.id, label: i.descripcion ?? '' })) },
    { key: 'precio1Cent', label: 'Precio 1 (RD$)', type: 'money' },
    { key: 'precio2Cent', label: 'Precio 2 (RD$)', type: 'money' },
    { key: 'precio3Cent', label: 'Precio 3 (RD$)', type: 'money' },
    { key: 'precioMayoristaCent', label: 'Precio mayorista (RD$)', type: 'money' },
    { key: 'precioMinimoCent', label: 'Precio mínimo (RD$)', type: 'money' },
    ...(verCostos
      ? [
        { key: 'costoPromedioCent', label: 'Costo promedio (RD$)', type: 'money' as const },
        { key: 'costoUltimaCompraCent', label: 'Última compra (RD$)', type: 'money' as const }
      ]
      : []),
    { key: 'existenciaMin', label: 'Existencia mínima', type: 'number' },
    { key: 'existenciaMax', label: 'Existencia máxima', type: 'number' },
    { key: 'ubicacion', label: 'Ubicación' },
    { key: 'imagenPath', label: 'Ruta de imagen' },
    { key: 'manejaSerie', label: 'Maneja series', type: 'checkbox' },
    { key: 'manejaLote', label: 'Maneja lotes', type: 'checkbox' },
    { key: 'activo', label: 'Producto activo', type: 'checkbox' }
  ]

  return (
    <>
      <MaestroCrud
        entidad="productos"
        title="Productos"
        subtitle="Catálogo de productos y precios. Los costos solo se muestran con permiso específico."
        columns={columns}
        campos={campos}
        defaults={{ tipo: 'FISICO', precio1Cent: 0 }}
        searchPlaceholder="Buscar por código, descripción o barras…"
        extraActions={verPrecios
          ? (row) => (
            <button
              onClick={() => void verHistorial(row)}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Historial de precios"
            ><History size={15} /></button>
          )
          : undefined}
      />
      <Modal
        open={!!historial}
        title={`Historial de precios — ${historial?.producto.descripcion ?? ''}`}
        onClose={() => setHistorial(null)}
        footer={<button onClick={() => setHistorial(null)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800">Cerrar</button>}
      >
        {historial?.items.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr><th className="py-2">Fecha</th><th>Campo</th><th className="text-right">Anterior</th><th className="text-right">Nuevo</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {historial.items.map((h, i) => (
                <tr key={i}>
                  <td className="py-2">{String(h.fecha)}</td>
                  <td>{etiquetasPrecio[String(h.campo)] ?? String(h.campo)}</td>
                  <td className="text-right">{money(Number(h.valor_anterior_cent))}</td>
                  <td className="text-right">{money(Number(h.valor_nuevo_cent))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">Aún no hay cambios de precios registrados para este producto.</p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Badge tone="accent">Auditable</Badge> Cada cambio queda registrado con usuario y fecha.
        </p>
      </Modal>
    </>
  )
}

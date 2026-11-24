import { useState } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { MaestroCrud, type CampoDef, type FilaMaestro } from './MaestroCrud'
import type { Column } from '@/components/ui/DataTable'

const simpleColumns = (label: string): Column<FilaMaestro>[] => [
  { key: 'nombre', header: label, value: (r) => String(r.nombre ?? '') }
]

interface Bloque {
  entidad: 'categorias' | 'marcas' | 'unidades_medida' | 'listas_precio' | 'vendedores'
  label: string
  titulo: string
  subtitulo: string
  columns: Column<FilaMaestro>[]
  campos: CampoDef[]
  defaults?: Record<string, unknown>
}

const bloques: Bloque[] = [
  {
    entidad: 'categorias', label: 'Categorías', titulo: 'Categorías',
    subtitulo: 'Clasificación jerárquica de productos.',
    columns: [...simpleColumns('Categoría'), { key: 'padre', header: 'Padre', value: (r) => String(r.padreId ?? '—') }],
    campos: [
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'padreId', label: 'Categoría superior (ID)', type: 'number', nullable: true, hint: 'Deje vacío si es una categoría raíz.' },
      { key: 'activo', label: 'Activa', type: 'checkbox' }
    ]
  },
  {
    entidad: 'marcas', label: 'Marcas', titulo: 'Marcas',
    subtitulo: 'Marcas utilizadas en el catálogo de productos.',
    columns: simpleColumns('Marca'),
    campos: [
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'activo', label: 'Activa', type: 'checkbox' }
    ]
  },
  {
    entidad: 'unidades_medida', label: 'Unidades', titulo: 'Unidades de medida',
    subtitulo: 'Unidades para la gestión de existencias.',
    columns: [
      { key: 'codigo', header: 'Código', value: (r) => String(r.codigo ?? '') },
      ...simpleColumns('Unidad'),
      { key: 'decimales', header: 'Decimales', value: (r) => Number(r.decimales ?? 0) }
    ],
    campos: [
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'decimales', label: 'Decimales', type: 'number' },
      { key: 'activo', label: 'Activa', type: 'checkbox' }
    ],
    defaults: { decimales: 2 }
  },
  {
    entidad: 'listas_precio', label: 'Listas de precio', titulo: 'Listas de precio',
    subtitulo: 'Listas asignables a clientes.',
    columns: [
      ...simpleColumns('Lista'),
      { key: 'observaciones', header: 'Observaciones', value: (r) => String(r.observaciones ?? '') }
    ],
    campos: [
      { key: 'nombre', label: 'Nombre', required: true },
      { key: 'observaciones', label: 'Observaciones', type: 'textarea', wide: true },
      { key: 'activo', label: 'Activa', type: 'checkbox' }
    ]
  },
  {
    entidad: 'vendedores', label: 'Vendedores', titulo: 'Vendedores',
    subtitulo: 'Vendedores y reglas de comisión.',
    columns: [
      { key: 'codigo', header: 'Código', value: (r) => String(r.codigo ?? '') },
      ...simpleColumns('Vendedor'),
      { key: 'regla', header: 'Regla', value: (r) => String(r.regla ?? '') },
      { key: 'comision', header: 'Comisión %', value: (r) => (Number(r.comisionPctBp ?? 0) / 100).toFixed(2) }
    ],
    campos: [
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nombre', label: 'Nombre', required: true },
      {
        key: 'regla', label: 'Regla de comisión', type: 'select',
        options: [
          { value: 'VENTA', label: 'Por venta' },
          { value: 'COBRO', label: 'Por cobro' },
          { value: 'PRODUCTO', label: 'Por producto' }
        ]
      },
      { key: 'comisionPctBp', label: 'Comisión %', type: 'number' },
      { key: 'activo', label: 'Activo', type: 'checkbox' }
    ],
    defaults: { regla: 'VENTA', comisionPctBp: 0 }
  }
]

export function CatalogosPage(): React.JSX.Element {
  const [activo, setActivo] = useState(bloques[0].entidad)
  const bloque = bloques.find((b) => b.entidad === activo) ?? bloques[0]

  return (
    <div>
      <Tabs
        tabs={bloques.map((b) => ({ id: b.entidad, label: b.label }))}
        active={activo}
        onChange={(id) => setActivo(id as Bloque['entidad'])}
      />
      <MaestroCrud
        key={bloque.entidad}
        entidad={bloque.entidad}
        title={bloque.titulo}
        subtitle={bloque.subtitulo}
        columns={bloque.columns}
        campos={bloque.campos}
        defaults={bloque.defaults}
        searchPlaceholder={`Buscar ${bloque.label.toLowerCase()}…`}
      />
    </div>
  )
}

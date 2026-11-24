import { MaestroCrud, type CampoDef, type FilaMaestro } from './MaestroCrud'
import type { Column } from '@/components/ui/DataTable'

const columns: Column<FilaMaestro>[] = [
  { key: 'codigo', header: 'Código', value: (r) => String(r.codigo ?? '') },
  { key: 'nombreComercial', header: 'Nombre comercial', value: (r) => String(r.nombreComercial ?? '') },
  { key: 'razonSocial', header: 'Razón social', value: (r) => String(r.razonSocial ?? '') },
  { key: 'rnc', header: 'RNC', value: (r) => String(r.rnc ?? '') },
  { key: 'contacto', header: 'Contacto', value: (r) => String(r.contacto ?? '') },
  { key: 'telefono', header: 'Teléfono', value: (r) => String(r.telefono ?? '') },
  { key: 'dias', header: 'Días pago', value: (r) => Number(r.condicionPagoDias ?? 0) }
]

const campos: CampoDef[] = [
  { key: 'codigo', label: 'Código', required: true },
  { key: 'nombreComercial', label: 'Nombre comercial', required: true },
  { key: 'razonSocial', label: 'Razón social' },
  { key: 'rnc', label: 'RNC' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Correo electrónico', type: 'email' },
  { key: 'direccion', label: 'Dirección', wide: true },
  { key: 'contacto', label: 'Persona de contacto' },
  { key: 'condicionPagoDias', label: 'Condición de pago (días)', type: 'number' },
  { key: 'cuentaBancaria', label: 'Cuenta bancaria' },
  { key: 'observaciones', label: 'Observaciones', type: 'textarea', wide: true },
  { key: 'activo', label: 'Proveedor activo', type: 'checkbox' }
]

export function ProveedoresPage(): React.JSX.Element {
  return (
    <MaestroCrud
      entidad="proveedores"
      title="Proveedores"
      subtitle="Datos fiscales, de contacto y condiciones de compra de proveedores."
      columns={columns}
      campos={campos}
      defaults={{ condicionPagoDias: 0 }}
      searchPlaceholder="Buscar por código, nombre, RNC o contacto…"
    />
  )
}

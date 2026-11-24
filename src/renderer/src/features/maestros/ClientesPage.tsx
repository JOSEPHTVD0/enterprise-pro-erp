import { useEffect, useState } from 'react'
import { MaestroCrud, type CampoDef, type FilaMaestro } from './MaestroCrud'
import type { Column } from '@/components/ui/DataTable'
import { money } from '@/lib/format'

interface Opcion { id: number; nombre: string }

export function ClientesPage(): React.JSX.Element {
  const [listas, setListas] = useState<Opcion[]>([])
  const [vendedores, setVendedores] = useState<Opcion[]>([])

  useEffect(() => {
    for (const [entidad, setter] of [
      ['listas_precio', setListas], ['vendedores', setVendedores]
    ] as const) {
      void window.api.invoke<FilaMaestro[]>('maestros.list', { entidad })
        .then((rows) => setter(rows.map((r) => ({ id: Number(r.id), nombre: String(r.nombre ?? '') }))))
        .catch(() => { /* permiso no otorgado: se muestra "Ninguno" */ })
    }
  }, [])

  const columns: Column<FilaMaestro>[] = [
    { key: 'codigo', header: 'Código', value: (r) => String(r.codigo ?? '') },
    { key: 'nombre', header: 'Nombre', value: (r) => String(r.nombre ?? '') },
    { key: 'rncCedula', header: 'RNC/Cédula', value: (r) => String(r.rncCedula ?? '') },
    { key: 'telefono', header: 'Teléfono', value: (r) => String(r.telefono ?? '') },
    { key: 'email', header: 'Correo', value: (r) => String(r.email ?? '') },
    { key: 'limite', header: 'Límite crédito', value: (r) => money(Number(r.limiteCreditoCent ?? 0)) },
    { key: 'dias', header: 'Días pago', value: (r) => Number(r.condicionPagoDias ?? 0) }
  ]

  const campos: CampoDef[] = [
    { key: 'codigo', label: 'Código', required: true },
    { key: 'nombre', label: 'Nombre / Razón social', required: true },
    {
      key: 'tipo', label: 'Tipo', type: 'select',
      options: [
        { value: 'EMPRESA', label: 'Empresa' },
        { value: 'PERSONA_FISICA', label: 'Persona física' }
      ]
    },
    { key: 'rncCedula', label: 'RNC o cédula' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'email', label: 'Correo electrónico', type: 'email' },
    { key: 'direccion', label: 'Dirección', wide: true },
    { key: 'provincia', label: 'Provincia' },
    { key: 'municipio', label: 'Municipio' },
    { key: 'limiteCreditoCent', label: 'Límite de crédito (RD$)', type: 'money' },
    { key: 'condicionPagoDias', label: 'Condición de pago (días)', type: 'number' },
    { key: 'listaPrecioId', label: 'Lista de precios', type: 'select', options: listas.map((l) => ({ value: l.id, label: l.nombre })) },
    { key: 'vendedorId', label: 'Vendedor', type: 'select', options: vendedores.map((v) => ({ value: v.id, label: v.nombre })) },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea', wide: true },
    { key: 'activo', label: 'Cliente activo', type: 'checkbox' }
  ]

  return (
    <MaestroCrud
      entidad="clientes"
      title="Clientes"
      subtitle="Cartera de clientes con datos fiscales, crédito y condiciones de pago."
      columns={columns}
      campos={campos}
      defaults={{ tipo: 'EMPRESA', limiteCreditoCent: 0, condicionPagoDias: 0 }}
      searchPlaceholder="Buscar por código, nombre, RNC o teléfono…"
    />
  )
}

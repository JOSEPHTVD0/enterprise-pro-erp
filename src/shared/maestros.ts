import { z } from 'zod'

/** Entidades de la Fase 4. El renderer nunca puede enviar un nombre de tabla arbitrario. */
export const maestroEntidades = [
  'clientes', 'proveedores', 'productos', 'categorias', 'marcas',
  'unidades_medida', 'listas_precio', 'vendedores'
] as const

export type MaestroEntidad = (typeof maestroEntidades)[number]

export const maestroEntidadSchema = z.enum(maestroEntidades)

/** Módulo de permisos que gobierna cada entidad (debe coincidir con `permissions.ts`). */
const moduloPorEntidad = {
  clientes: 'clientes',
  proveedores: 'proveedores',
  productos: 'productos',
  categorias: 'productos',
  marcas: 'productos',
  unidades_medida: 'productos',
  listas_precio: 'productos',
  vendedores: 'vendedores'
} as const

export function maestroModule(entidad: MaestroEntidad): string {
  return moduloPorEntidad[entidad]
}

export function maestroPermiso(entidad: MaestroEntidad, operacion: 'consultar' | 'crear' | 'modificar' | 'eliminar'): string {
  return `${maestroModule(entidad)}.${operacion}`
}

const id = z.number().int().positive().optional()
const nullableId = z.number().int().positive().nullable().optional()
const texto = (max: number) => z.string().max(max).default('')
const requerido = (min: number, max: number) => z.string().min(min).max(max)
const correo = z.string().max(120).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Correo electrónico inválido').default('')
const activo = z.boolean().default(true)
const dinero = z.number().int().nonnegative()

export const clienteSchema = z.object({
  id,
  codigo: requerido(1, 30),
  nombre: requerido(2, 160),
  tipo: z.enum(['EMPRESA', 'PERSONA_FISICA']).default('EMPRESA'),
  rncCedula: texto(20),
  telefono: texto(30),
  whatsapp: texto(30),
  email: correo,
  direccion: texto(250),
  provincia: texto(80),
  municipio: texto(80),
  limiteCreditoCent: dinero.default(0),
  condicionPagoDias: z.number().int().min(0).max(365).default(0),
  listaPrecioId: nullableId,
  vendedorId: nullableId,
  observaciones: texto(1000),
  activo
})

export const proveedorSchema = z.object({
  id,
  codigo: requerido(1, 30),
  nombreComercial: requerido(2, 160),
  razonSocial: texto(160),
  rnc: texto(20),
  telefono: texto(30),
  email: correo,
  direccion: texto(250),
  contacto: texto(120),
  condicionPagoDias: z.number().int().min(0).max(365).default(0),
  cuentaBancaria: texto(60),
  observaciones: texto(1000),
  activo
})

export const productoSchema = z.object({
  id,
  codigo: requerido(1, 30),
  barcode: texto(60),
  referencia: texto(60),
  descripcion: requerido(2, 200),
  descripcionExtra: texto(500),
  categoriaId: nullableId,
  marcaId: nullableId,
  modelo: texto(80),
  unidadId: nullableId,
  tipo: z.enum(['FISICO', 'SERVICIO', 'COMPUESTO', 'SERIALIZADO', 'LOTE']).default('FISICO'),
  costoPromedioCent: dinero.default(0),
  costoUltimaCompraCent: dinero.default(0),
  precio1Cent: dinero.default(0),
  precio2Cent: dinero.default(0),
  precio3Cent: dinero.default(0),
  precioMayoristaCent: dinero.default(0),
  precioMinimoCent: dinero.default(0),
  impuestoId: nullableId,
  existenciaMin: z.number().nonnegative().default(0),
  existenciaMax: z.number().nonnegative().default(0),
  ubicacion: texto(100),
  imagenPath: texto(250),
  manejaSerie: z.boolean().default(false),
  manejaLote: z.boolean().default(false),
  activo
})

export const categoriaSchema = z.object({
  id,
  nombre: requerido(2, 100),
  padreId: nullableId,
  activo
})

export const marcaSchema = z.object({ id, nombre: requerido(2, 100), activo })
export const unidadSchema = z.object({
  id, codigo: requerido(1, 20), nombre: requerido(2, 100),
  decimales: z.number().int().min(0).max(4).default(2), activo
})
export const listaPrecioSchema = z.object({
  id, nombre: requerido(2, 100), observaciones: texto(500), activo
})
export const vendedorSchema = z.object({
  id,
  codigo: requerido(1, 20),
  nombre: requerido(2, 120),
  usuarioId: nullableId,
  comisionPctBp: z.number().int().min(0).max(10000).default(0),
  regla: z.enum(['VENTA', 'COBRO', 'PRODUCTO']).default('VENTA'),
  activo
})

export const maestroSchemas = {
  clientes: clienteSchema,
  proveedores: proveedorSchema,
  productos: productoSchema,
  categorias: categoriaSchema,
  marcas: marcaSchema,
  unidades_medida: unidadSchema,
  listas_precio: listaPrecioSchema,
  vendedores: vendedorSchema
} as const

export function parseMaestro(entidad: MaestroEntidad, data: unknown): Record<string, unknown> {
  return maestroSchemas[entidad].parse(data) as Record<string, unknown>
}

/** Campo que identifica cada maestro dentro de una empresa. */
export function campoUnico(entidad: MaestroEntidad): 'codigo' | 'nombre' {
  return entidad === 'categorias' || entidad === 'marcas' || entidad === 'listas_precio' ? 'nombre' : 'codigo'
}

/** Campos de precio cuyo cambio debe quedar registrado en `historial_precios`. */
export const camposPrecio = [
  'precio1Cent', 'precio2Cent', 'precio3Cent', 'precioMayoristaCent', 'precioMinimoCent',
  'costoPromedioCent', 'costoUltimaCompraCent'
] as const

export interface MaestroFiltro {
  entidad: MaestroEntidad
  incluirInactivos?: boolean
}

/** Columnas canónicas para Excel. La misma definición alimenta exportación, plantilla e importación. */
export interface MaestroColumna {
  key: string
  header: string
  tipo?: 'bool'
}

const col = (key: string, header: string, tipo?: 'bool'): MaestroColumna => ({ key, header, tipo })

export const maestroColumnas: Record<MaestroEntidad, MaestroColumna[]> = {
  clientes: [
    col('codigo', 'Código'), col('nombre', 'Nombre / Razón social'),
    col('tipo', 'Tipo (EMPRESA/PERSONA_FISICA)'), col('rncCedula', 'RNC o cédula'),
    col('telefono', 'Teléfono'), col('whatsapp', 'WhatsApp'), col('email', 'Correo electrónico'),
    col('direccion', 'Dirección'), col('provincia', 'Provincia'), col('municipio', 'Municipio'),
    col('limiteCreditoCent', 'Límite de crédito (centavos)'), col('condicionPagoDias', 'Condición de pago (días)'),
    col('listaPrecioId', 'ID lista de precios'), col('vendedorId', 'ID vendedor'),
    col('observaciones', 'Observaciones'), col('activo', 'Activo (1/0)', 'bool')
  ],
  proveedores: [
    col('codigo', 'Código'), col('nombreComercial', 'Nombre comercial'), col('razonSocial', 'Razón social'),
    col('rnc', 'RNC'), col('telefono', 'Teléfono'), col('email', 'Correo electrónico'),
    col('direccion', 'Dirección'), col('contacto', 'Contacto'),
    col('condicionPagoDias', 'Condición de pago (días)'), col('cuentaBancaria', 'Cuenta bancaria'),
    col('observaciones', 'Observaciones'), col('activo', 'Activo (1/0)', 'bool')
  ],
  productos: [
    col('codigo', 'Código'), col('descripcion', 'Descripción'), col('barcode', 'Código de barras'),
    col('referencia', 'Referencia'), col('modelo', 'Modelo'), col('descripcionExtra', 'Descripción adicional'),
    col('tipo', 'Tipo'), col('categoriaId', 'ID categoría'), col('marcaId', 'ID marca'),
    col('unidadId', 'ID unidad de medida'), col('impuestoId', 'ID impuesto'),
    col('precio1Cent', 'Precio 1 (centavos)'), col('precio2Cent', 'Precio 2 (centavos)'),
    col('precio3Cent', 'Precio 3 (centavos)'), col('precioMayoristaCent', 'Precio mayorista (centavos)'),
    col('precioMinimoCent', 'Precio mínimo (centavos)'),
    col('costoPromedioCent', 'Costo promedio (centavos)'), col('costoUltimaCompraCent', 'Última compra (centavos)'),
    col('existenciaMin', 'Existencia mínima'), col('existenciaMax', 'Existencia máxima'),
    col('ubicacion', 'Ubicación'), col('imagenPath', 'Ruta de imagen'),
    col('manejaSerie', 'Maneja series (1/0)', 'bool'), col('manejaLote', 'Maneja lotes (1/0)', 'bool'),
    col('activo', 'Activo (1/0)', 'bool')
  ],
  categorias: [col('nombre', 'Nombre'), col('padreId', 'ID categoría superior'), col('activo', 'Activo (1/0)', 'bool')],
  marcas: [col('nombre', 'Nombre'), col('activo', 'Activo (1/0)', 'bool')],
  unidades_medida: [
    col('codigo', 'Código'), col('nombre', 'Nombre'), col('decimales', 'Decimales'), col('activo', 'Activo (1/0)', 'bool')
  ],
  listas_precio: [col('nombre', 'Nombre'), col('observaciones', 'Observaciones'), col('activo', 'Activo (1/0)', 'bool')],
  vendedores: [
    col('codigo', 'Código'), col('nombre', 'Nombre'), col('usuarioId', 'ID usuario'),
    col('comisionPctBp', 'Comisión (puntos base)'), col('regla', 'Regla (VENTA/COBRO/PRODUCTO)'),
    col('activo', 'Activo (1/0)', 'bool')
  ]
}

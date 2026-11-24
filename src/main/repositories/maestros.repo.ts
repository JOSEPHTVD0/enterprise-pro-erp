import type { Db } from '../db/connection'
import {
  maestroEntidades, type MaestroEntidad, campoUnico
} from '@shared/maestros'

/** Lista blanca: el renderer jamás elige tablas ni columnas. */
const columnas: Record<MaestroEntidad, Record<string, string>> = {
  clientes: {
    codigo: 'codigo', nombre: 'nombre', tipo: 'tipo', rncCedula: 'rnc_cedula',
    telefono: 'telefono', whatsapp: 'whatsapp', email: 'email', direccion: 'direccion',
    provincia: 'provincia', municipio: 'municipio', limiteCreditoCent: 'limite_credito_cent',
    condicionPagoDias: 'condicion_pago_dias', listaPrecioId: 'lista_precio_id',
    vendedorId: 'vendedor_id', observaciones: 'observaciones', activo: 'activo'
  },
  proveedores: {
    codigo: 'codigo', nombreComercial: 'nombre_comercial', razonSocial: 'razon_social',
    rnc: 'rnc', telefono: 'telefono', email: 'email', direccion: 'direccion',
    contacto: 'contacto', condicionPagoDias: 'condicion_pago_dias',
    cuentaBancaria: 'cuenta_bancaria', observaciones: 'observaciones', activo: 'activo'
  },
  productos: {
    codigo: 'codigo', barcode: 'barcode', referencia: 'referencia', descripcion: 'descripcion',
    descripcionExtra: 'descripcion_extra', categoriaId: 'categoria_id', marcaId: 'marca_id',
    modelo: 'modelo', unidadId: 'unidad_id', tipo: 'tipo',
    costoPromedioCent: 'costo_promedio_cent', costoUltimaCompraCent: 'costo_ultima_compra_cent',
    precio1Cent: 'precio1_cent', precio2Cent: 'precio2_cent', precio3Cent: 'precio3_cent',
    precioMayoristaCent: 'precio_mayorista_cent', precioMinimoCent: 'precio_minimo_cent',
    impuestoId: 'impuesto_id', existenciaMin: 'existencia_min', existenciaMax: 'existencia_max',
    ubicacion: 'ubicacion', imagenPath: 'imagen_path', manejaSerie: 'maneja_serie',
    manejaLote: 'maneja_lote', activo: 'activo'
  },
  categorias: { nombre: 'nombre', padreId: 'padre_id', activo: 'activo' },
  marcas: { nombre: 'nombre', activo: 'activo' },
  unidades_medida: { codigo: 'codigo', nombre: 'nombre', decimales: 'decimales', activo: 'activo' },
  listas_precio: { nombre: 'nombre', observaciones: 'observaciones', activo: 'activo' },
  vendedores: {
    codigo: 'codigo', nombre: 'nombre', usuarioId: 'usuario_id',
    comisionPctBp: 'comision_pct_bp', regla: 'regla', activo: 'activo'
  }
}

function tabla(entidad: string): MaestroEntidad {
  if (!maestroEntidades.includes(entidad as MaestroEntidad)) {
    throw new Error(`Entidad no permitida: ${entidad}`)
  }
  return entidad as MaestroEntidad
}

function aCamel(fila: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fila).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), v])
  )
}

function aSnake(entidad: MaestroEntidad, data: Record<string, unknown>): Record<string, unknown> {
  const map = columnas[entidad]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = map[k]
    if (!col || v === undefined || k === 'id') continue
    out[col] = typeof v === 'boolean' ? (v ? 1 : 0) : v
  }
  return out
}

export type MaestroFila = Record<string, unknown> & { id: number; activo: number }

export function listar(db: Db, entidad: string, empresaId: number, incluirInactivos = true): MaestroFila[] {
  const t = tabla(entidad)
  const where = incluirInactivos ? '' : ' AND activo = 1'
  const rows = db.prepare(`SELECT * FROM ${t} WHERE empresa_id = ?${where} ORDER BY id DESC`)
    .all(empresaId) as Record<string, unknown>[]
  return rows.map((r) => aCamel(r) as MaestroFila)
}

export function obtener(db: Db, entidad: string, empresaId: number, id: number): MaestroFila | undefined {
  const t = tabla(entidad)
  const row = db.prepare(`SELECT * FROM ${t} WHERE id = ? AND empresa_id = ?`).get(id, empresaId) as Record<string, unknown> | undefined
  return row ? aCamel(row) as MaestroFila : undefined
}

export function existeRegistro(db: Db, entidad: string, empresaId: number, id: number): boolean {
  const t = tabla(entidad)
  return !!db.prepare(`SELECT 1 FROM ${t} WHERE id = ? AND empresa_id = ?`).get(id, empresaId)
}

export function existeImpuesto(db: Db, empresaId: number, id: number): boolean {
  return !!db.prepare('SELECT 1 FROM impuestos WHERE id = ? AND empresa_id = ?').get(id, empresaId)
}

export function existeUsuario(db: Db, id: number): boolean {
  return !!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)
}

export function existeValor(
  db: Db, entidad: string, empresaId: number, valor: string, excluirId?: number
): boolean {
  const t = tabla(entidad)
  const campo = campoUnico(t)
  const row = db.prepare(`SELECT 1 FROM ${t} WHERE empresa_id = ? AND ${campo} = ? AND id <> ?`)
    .get(empresaId, valor, excluirId ?? -1)
  return !!row
}

export function guardar(db: Db, entidad: string, empresaId: number, data: Record<string, unknown>): number {
  const t = tabla(entidad)
  const values = { empresa_id: empresaId, ...aSnake(t, data) }
  const id = data.id as number | undefined
  if (id) {
    const sets = Object.keys(values).filter((c) => c !== 'empresa_id').map((c) => `${c} = @${c}`).join(', ')
    const conFecha = ['clientes', 'proveedores', 'productos', 'vendedores'].includes(t)
    db.prepare(`UPDATE ${t} SET ${sets}${conFecha ? ", actualizado_en = datetime('now')" : ''} WHERE id = @id AND empresa_id = @empresa_id`)
      .run({ ...values, id })
    return id
  }
  const cols = Object.keys(values)
  const res = db.prepare(`
    INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})
  `).run(values)
  return Number(res.lastInsertRowid)
}

export function cambiarActivo(db: Db, entidad: string, empresaId: number, id: number, activo: boolean): void {
  const t = tabla(entidad)
  const conFecha = ['clientes', 'proveedores', 'productos', 'vendedores'].includes(t)
  db.prepare(`UPDATE ${t} SET activo = ?${conFecha ? ", actualizado_en = datetime('now')" : ''} WHERE id = ? AND empresa_id = ?`)
    .run(activo ? 1 : 0, id, empresaId)
}

export function borrarLogicamente(db: Db, entidad: string, empresaId: number, id: number): void {
  cambiarActivo(db, entidad, empresaId, id, false)
}

/** Referencias que impiden desactivar un catálogo usado por otros maestros. */
export function referenciasActivas(db: Db, entidad: string, empresaId: number, id: number): string[] {
  const t = tabla(entidad)
  const usos: Record<string, { sql: string; params: number[]; etiqueta: string }[]> = {
    categorias: [
      { sql: 'SELECT 1 FROM productos WHERE categoria_id = ? AND empresa_id = ? LIMIT 1', params: [id, empresaId], etiqueta: 'productos' },
      { sql: 'SELECT 1 FROM categorias WHERE padre_id = ? AND empresa_id = ? LIMIT 1', params: [id, empresaId], etiqueta: 'subcategorías' }
    ],
    marcas: [
      { sql: 'SELECT 1 FROM productos WHERE marca_id = ? AND empresa_id = ? LIMIT 1', params: [id, empresaId], etiqueta: 'productos' }
    ],
    unidades_medida: [
      { sql: 'SELECT 1 FROM productos WHERE unidad_id = ? AND empresa_id = ? LIMIT 1', params: [id, empresaId], etiqueta: 'productos' }
    ],
    listas_precio: [
      { sql: 'SELECT 1 FROM clientes WHERE lista_precio_id = ? AND empresa_id = ? LIMIT 1', params: [id, empresaId], etiqueta: 'clientes' },
      { sql: 'SELECT 1 FROM lista_precio_items WHERE lista_id = ? LIMIT 1', params: [id], etiqueta: 'ítems de lista' }
    ],
    vendedores: [
      { sql: 'SELECT 1 FROM clientes WHERE vendedor_id = ? AND empresa_id = ? LIMIT 1', params: [id, empresaId], etiqueta: 'clientes' }
    ],
    productos: [
      { sql: 'SELECT 1 FROM producto_componentes WHERE componente_id = ? LIMIT 1', params: [id], etiqueta: 'productos compuestos' },
      { sql: 'SELECT 1 FROM lista_precio_items WHERE producto_id = ? LIMIT 1', params: [id], etiqueta: 'listas de precio' }
    ]
  }
  return (usos[t] ?? []).filter((u) => !!db.prepare(u.sql).get(...u.params)).map((u) => u.etiqueta)
}

export function historialPrecios(db: Db, empresaId: number, productoId: number): Record<string, unknown>[] {
  return db.prepare(`
    SELECT h.*, p.descripcion FROM historial_precios h
    JOIN productos p ON p.id = h.producto_id
    WHERE h.empresa_id = ? AND h.producto_id = ? ORDER BY h.fecha DESC, h.id DESC
  `).all(empresaId, productoId) as Record<string, unknown>[]
}

export function registrarCambioPrecio(
  db: Db, empresaId: number, productoId: number, campo: string, anterior: number, nuevo: number, usuarioId: number
): void {
  db.prepare(`
    INSERT INTO historial_precios (empresa_id, producto_id, campo, valor_anterior_cent, valor_nuevo_cent, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(empresaId, productoId, campo, anterior, nuevo, usuarioId)
}

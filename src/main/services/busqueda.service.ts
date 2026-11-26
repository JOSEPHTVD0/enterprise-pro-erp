import type { Db } from '../db/connection'
import type { SessionContext } from '@shared/session'
import * as repo from '../repositories/maestros.repo'
import { maestroEntidades, maestroModule, type MaestroEntidad } from '@shared/maestros'
import { normalizarTexto, tokensBusqueda } from '@shared/texto'
import type { BusquedaGlobalInput, BusquedaGlobalResultado } from '@shared/schemas/busqueda'

/** Campos legibles por entidad. Nunca se incluyen costos ni datos sensibles. */
const camposBusqueda: Record<MaestroEntidad, string[]> = {
  clientes: ['codigo', 'nombre', 'rncCedula', 'telefono', 'email', 'provincia', 'municipio'],
  proveedores: ['codigo', 'nombreComercial', 'razonSocial', 'rnc', 'telefono', 'email', 'contacto'],
  productos: ['codigo', 'barcode', 'referencia', 'descripcion', 'modelo', 'ubicacion'],
  categorias: ['nombre'],
  marcas: ['nombre'],
  unidades_medida: ['codigo', 'nombre'],
  listas_precio: ['nombre', 'observaciones'],
  vendedores: ['codigo', 'nombre', 'regla']
}

const campoPrincipal: Record<MaestroEntidad, string> = {
  clientes: 'nombre',
  proveedores: 'nombreComercial',
  productos: 'descripcion',
  categorias: 'nombre',
  marcas: 'nombre',
  unidades_medida: 'nombre',
  listas_precio: 'nombre',
  vendedores: 'nombre'
}

const etiquetas: Record<MaestroEntidad, string> = {
  clientes: 'Cliente',
  proveedores: 'Proveedor',
  productos: 'Producto',
  categorias: 'Categoría',
  marcas: 'Marca',
  unidades_medida: 'Unidad',
  listas_precio: 'Lista de precio',
  vendedores: 'Vendedor'
}

const vistas: Record<MaestroEntidad, string> = {
  clientes: 'clientes',
  proveedores: 'proveedores',
  productos: 'productos',
  categorias: 'catalogos',
  marcas: 'catalogos',
  unidades_medida: 'catalogos',
  listas_precio: 'catalogos',
  vendedores: 'vendedores'
}

/** Resultados ordenados por relevancia, sin exponer registros de otras empresas ni sin permiso. */
export function createBusquedaService(db: Db) {
  return {
    global(ctx: SessionContext, entrada: BusquedaGlobalInput): BusquedaGlobalResultado[] {
      const terminos = tokensBusqueda(entrada.texto)
      if (terminos.length === 0) return []

      const solicitadas = entrada.entidades?.length ? entrada.entidades : maestroEntidades
      const permitidas = solicitadas.filter((entidad) =>
        ctx.permisos.includes(`${maestroModule(entidad)}.consultar`))

      const resultados: BusquedaGlobalResultado[] = []
      for (const entidad of permitidas) {
        const filas = repo.listar(db, entidad, ctx.empresaId, entrada.incluirInactivos === true)
        for (const fila of filas) {
          const buscable = normalizarTexto(camposBusqueda[entidad].map((campo) => fila[campo]).join(' '))
          if (!terminos.every((termino) => buscable.includes(termino))) continue

          const titulo = String(fila[campoPrincipal[entidad]] ?? fila.codigo ?? 'Registro')
          const codigo = String(fila.codigo ?? '')
          const tituloNorm = normalizarTexto(titulo)
          const codigoNorm = normalizarTexto(codigo)
          let score = 1
          if (terminos.every((termino) => tituloNorm.includes(termino))) score += 2
          if (codigoNorm && terminos.every((termino) => codigoNorm.includes(termino))) score += 3
          if (tituloNorm.startsWith(terminos[0])) score += 1

          resultados.push({
            id: `${entidad}:${String(fila.id)}`,
            entidad,
            titulo,
            subtitulo: `${etiquetas[entidad]}${codigo ? ` · ${codigo}` : ''}`,
            vista: vistas[entidad],
            score
          })
        }
      }

      return resultados
        .sort((a, b) => b.score - a.score || a.titulo.localeCompare(b.titulo, 'es', { numeric: true }))
        .slice(0, entrada.limite)
    }
  }
}

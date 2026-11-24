import ExcelJS from 'exceljs'
import type { Db } from '../db/connection'
import { writeAudit } from '../repositories/auditoria.repo'
import * as repo from '../repositories/maestros.repo'
import { requirePermission, type SessionContext } from './context'
import { errors, serializeError } from '@shared/errors'
import {
  parseMaestro, campoUnico, camposPrecio, maestroModule, maestroColumnas,
  type MaestroEntidad, type MaestroFiltro, type MaestroColumna
} from '@shared/maestros'

/** Referencias obligatorias por entidad. Todas se validan dentro de la misma empresa. */
const referencias: Partial<Record<MaestroEntidad, Record<string, MaestroEntidad | 'impuestos' | 'usuarios'>>> = {
  clientes: { listaPrecioId: 'listas_precio', vendedorId: 'vendedores' },
  productos: {
    categoriaId: 'categorias', marcaId: 'marcas', unidadId: 'unidades_medida', impuestoId: 'impuestos'
  },
  categorias: { padreId: 'categorias' },
  vendedores: { usuarioId: 'usuarios' }
}

export function createMaestrosService(db: Db) {
  function audit(ctx: SessionContext, operacion: string, entidad: string, id: number, antes: unknown, despues: unknown): void {
    writeAudit(db, {
      empresaId: ctx.empresaId, userId: ctx.userId, sesionId: ctx.sesionId
    }, operacion, entidad, id, antes, despues)
  }

  /** Las columnas sensibles no se exportan ni se importan sin su permiso específico. */
  function columnasVisibles(ctx: SessionContext, entidad: MaestroEntidad): MaestroColumna[] {
    let columnas = maestroColumnas[entidad]
    if (entidad === 'productos') {
      if (!ctx.permisos.includes('productos.costo')) {
        columnas = columnas.filter((c) => !['costoPromedioCent', 'costoUltimaCompraCent'].includes(c.key))
      }
      if (!ctx.permisos.includes('productos.precio')) {
        columnas = columnas.filter((c) => !c.key.includes('precio') && !c.key.includes('Precio'))
      }
    }
    return columnas
  }

  async function workbook(ctx: SessionContext, entidad: MaestroEntidad, filas: Record<string, unknown>[]): Promise<string> {
    const columnas = columnasVisibles(ctx, entidad)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Maestros')
    ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: Math.max(15, c.header.length + 3) }))
    ws.getRow(1).font = { bold: true }
    for (const fila of filas) ws.addRow(fila)
    const buffer = await wb.xlsx.writeBuffer()
    return Buffer.from(buffer).toString('base64')
  }

  function celdaValor(value: unknown): unknown {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') {
      const obj = value as { text?: unknown; result?: unknown; richText?: { text: string }[] }
      if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('')
      if (obj.text !== undefined) return obj.text
      if (obj.result !== undefined) return obj.result
      return String(value)
    }
    return value
  }

  function validarReferencias(entidad: MaestroEntidad, empresaId: number, data: Record<string, unknown>): void {
    for (const [campo, destino] of Object.entries(referencias[entidad] ?? {})) {
      const valor = data[campo]
      if (valor === null || valor === undefined || valor === '') continue
      const existe = destino === 'impuestos'
        ? repo.existeImpuesto(db, empresaId, Number(valor))
        : destino === 'usuarios'
          ? repo.existeUsuario(db, Number(valor))
          : repo.existeRegistro(db, destino, empresaId, Number(valor))
      if (!existe) throw errors.validation(`El registro seleccionado en ${campo} no existe en esta empresa.`)
    }
  }

  return {
    list(ctx: SessionContext, filtro: MaestroFiltro) {
      const entidad = filtro.entidad
      requirePermission(ctx, `${maestroModule(entidad)}.consultar`)
      const filas = repo.listar(db, entidad, ctx.empresaId, filtro.incluirInactivos !== false)
      if (entidad === 'productos' && !ctx.permisos.includes('productos.costo')) {
        return filas.map((f) => {
          const copia = { ...f }
          delete copia.costoPromedioCent
          delete copia.costoUltimaCompraCent
          return copia
        })
      }
      return filas
    },

    get(ctx: SessionContext, entidad: MaestroEntidad, id: number) {
      requirePermission(ctx, `${maestroModule(entidad)}.consultar`)
      const fila = repo.obtener(db, entidad, ctx.empresaId, id)
      if (!fila) throw errors.notFound('Registro')
      return fila
    },

    save(ctx: SessionContext, entidad: MaestroEntidad, entrada: unknown) {
      // Permiso antes de validar el resto del payload (mismo orden que el router).
      const esEdicion = !!entrada && typeof entrada === 'object' &&
        typeof (entrada as { id?: unknown }).id === 'number' && ((entrada as { id: number }).id > 0)
      requirePermission(ctx, `${maestroModule(entidad)}.${esEdicion ? 'modificar' : 'crear'}`)
      const data = parseMaestro(entidad, entrada)
      const id = data.id as number | undefined

      const anterior = id ? repo.obtener(db, entidad, ctx.empresaId, id) : undefined
      if (id && !anterior) throw errors.notFound('Registro')

      const campo = campoUnico(entidad)
      const valorUnico = String(data[campo] ?? '')
      if (repo.existeValor(db, entidad, ctx.empresaId, valorUnico, id)) {
        throw errors.conflict(`Ya existe otro registro con el mismo ${campo === 'codigo' ? 'código' : 'nombre'}.`)
      }
      validarReferencias(entidad, ctx.empresaId, data)

      if (entidad === 'productos') {
        const cambioPrecio = camposPrecio.some((c) => Number(anterior?.[c] ?? 0) !== Number(data[c] ?? 0))
        if (cambioPrecio) requirePermission(ctx, 'productos.precio')
      }

      const savedId = db.transaction(() => {
        const resultado = repo.guardar(db, entidad, ctx.empresaId, data)
        if (entidad === 'productos') {
          for (const c of camposPrecio) {
            const viejo = Number(anterior?.[c] ?? 0)
            const nuevo = Number(data[c] ?? 0)
            if (nuevo !== viejo) repo.registrarCambioPrecio(db, ctx.empresaId, resultado, c, viejo, nuevo, ctx.userId)
          }
        }
        audit(ctx, id ? 'MODIFICAR' : 'CREAR', entidad, resultado, anterior ?? null, data)
        return resultado
      })()
      return { id: savedId }
    },

    status(ctx: SessionContext, entidad: MaestroEntidad, id: number, activo: boolean) {
      requirePermission(ctx, `${maestroModule(entidad)}.modificar`)
      const anterior = repo.obtener(db, entidad, ctx.empresaId, id)
      if (!anterior) throw errors.notFound('Registro')
      if (!activo) {
        const usos = repo.referenciasActivas(db, entidad, ctx.empresaId, id)
        if (usos.length) throw errors.conflict(`No se puede desactivar: está referenciado por ${usos.join(', ')}.`)
      }
      db.transaction(() => {
        repo.cambiarActivo(db, entidad, ctx.empresaId, id, activo)
        audit(ctx, activo ? 'ACTIVAR' : 'DESACTIVAR', entidad, id, anterior, { activo })
      })()
      return { ok: true }
    },

    remove(ctx: SessionContext, entidad: MaestroEntidad, id: number) {
      requirePermission(ctx, `${maestroModule(entidad)}.eliminar`)
      const anterior = repo.obtener(db, entidad, ctx.empresaId, id)
      if (!anterior) throw errors.notFound('Registro')
      const usos = repo.referenciasActivas(db, entidad, ctx.empresaId, id)
      if (usos.length) throw errors.conflict(`No se puede eliminar: está referenciado por ${usos.join(', ')}.`)
      db.transaction(() => {
        repo.borrarLogicamente(db, entidad, ctx.empresaId, id)
        audit(ctx, 'ELIMINAR', entidad, id, anterior, null)
      })()
      return { ok: true }
    },

    async plantilla(ctx: SessionContext, entidad: MaestroEntidad) {
      requirePermission(ctx, `${maestroModule(entidad)}.consultar`)
      requirePermission(ctx, `${maestroModule(entidad)}.crear`)
      return { filename: `plantilla_${entidad}.xlsx`, base64: await workbook(ctx, entidad, []) }
    },

    async exportar(ctx: SessionContext, entidad: MaestroEntidad) {
      requirePermission(ctx, `${maestroModule(entidad)}.consultar`)
      requirePermission(ctx, `${maestroModule(entidad)}.exportar`)
      const filas = repo.listar(db, entidad, ctx.empresaId, true) as Record<string, unknown>[]
      const fecha = new Date().toISOString().slice(0, 10)
      return { filename: `${entidad}_${fecha}.xlsx`, base64: await workbook(ctx, entidad, filas) }
    },

    async importar(ctx: SessionContext, entidad: MaestroEntidad, base64: string) {
      requirePermission(ctx, `${maestroModule(entidad)}.consultar`)
      requirePermission(ctx, `${maestroModule(entidad)}.crear`)
      if (!base64 || base64.length > 12_000_000) {
        throw errors.validation('El archivo está vacío o excede el tamaño permitido.')
      }
      const wb = new ExcelJS.Workbook()
      try {
        const buffer = Buffer.from(base64, 'base64')
        await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])
      } catch {
        throw errors.validation('El archivo no es un Excel válido (.xlsx).')
      }
      const ws = wb.worksheets[0]
      if (!ws) throw errors.validation('El archivo no contiene hojas.')

      const permitidas = columnasVisibles(ctx, entidad)
      const mapa = new Map<string, MaestroColumna>()
      for (const c of permitidas) {
        mapa.set(c.header.toLowerCase(), c)
        mapa.set(c.key.toLowerCase(), c)
      }
      const primeraFila = ws.getRow(1).values
      const columnas: (MaestroColumna | undefined)[] = (Array.isArray(primeraFila) ? primeraFila.slice(1) : [])
        .map((h) => mapa.get(String(celdaValor(h)).trim().toLowerCase()))
      const campo = campoUnico(entidad)
      if (!columnas.some((c) => c?.key === campo)) {
        throw errors.validation(`La plantilla debe incluir la columna «${permitidas.find((c) => c.key === campo)?.header ?? campo}».`)
      }
      if (entidad === 'productos') {
        const presentes = new Set(columnas.filter(Boolean).map((c) => c!.key))
        if (['costoPromedioCent', 'costoUltimaCompraCent'].some((k) => presentes.has(k))) {
          requirePermission(ctx, 'productos.costo')
        }
        if ([...presentes].some((k) => k.toLowerCase().includes('precio'))) {
          requirePermission(ctx, 'productos.precio')
        }
      }

      const vistos = new Set<string>()
      const preparados: { fila: number; data: Record<string, unknown> }[] = []
      const errores: { fila: number; mensaje: string }[] = []
      ws.eachRow((row, fila) => {
        if (fila === 1) return
        const raw: Record<string, unknown> = {}
        columnas.forEach((col, i) => {
          if (!col) return
          const valor = celdaValor(row.getCell(i + 1).value)
          if (valor === '' || valor === null || valor === undefined) return
          raw[col.key] = col.tipo === 'bool'
            ? ['1', 'SI', 'SÍ', 'TRUE', 'VERDADERO', 'S', 'Y', 'YES'].includes(String(valor).trim().toUpperCase())
            : valor
        })
        if (!Object.keys(raw).length) return
        try {
          const data = parseMaestro(entidad, raw)
          validarReferencias(entidad, ctx.empresaId, data)
          const valorUnico = String(data[campo] ?? '')
          if (!valorUnico) throw errors.validation(`Falta el campo ${campo}.`)
          if (vistos.has(valorUnico) || repo.existeValor(db, entidad, ctx.empresaId, valorUnico)) {
            throw errors.conflict(`Ya existe un registro con ${campo} ${valorUnico}.`)
          }
          vistos.add(valorUnico)
          preparados.push({ fila, data })
        } catch (e) {
          errores.push({ fila, mensaje: serializeError(e).message })
        }
      })

      db.transaction(() => {
        for (const item of preparados) {
          const id = repo.guardar(db, entidad, ctx.empresaId, item.data)
          if (entidad === 'productos') {
            for (const c of camposPrecio) {
              const valor = Number(item.data[c] ?? 0)
              if (valor) repo.registrarCambioPrecio(db, ctx.empresaId, id, c, 0, valor, ctx.userId)
            }
          }
          audit(ctx, 'IMPORTAR', entidad, id, null, item.data)
        }
      })()
      return { insertados: preparados.length, errores }
    },

    historialPrecios(ctx: SessionContext, productoId: number) {
      requirePermission(ctx, 'productos.consultar')
      requirePermission(ctx, 'productos.precio')
      return repo.historialPrecios(db, ctx.empresaId, productoId)
    }
  }
}

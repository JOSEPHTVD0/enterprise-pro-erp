import { describe, expect, it } from 'vitest'
import { coincideTexto, normalizarTexto, tokensBusqueda } from '@shared/texto'
import {
  compararValores, eliminarVista, filtrarFilas, guardarVista, leerVistas, nuevaRegla,
  ordenarFilas, type AlmacenVistas, type ColumnaFiltro, type ReglaFiltro, type VistaGuardada
} from '@/lib/filtros-avanzados'

interface Fila {
  id: number
  nombre: string
  codigo: string
  total: number
  fecha: string
  nota: string
}

const columnas: ColumnaFiltro<Fila>[] = [
  { key: 'nombre' }, { key: 'codigo' }, { key: 'total' }, { key: 'fecha' }, { key: 'nota' }
]

const filas: Fila[] = [
  { id: 1, nombre: 'Aceite principal', codigo: 'A-01', total: 100, fecha: '2026-01-02', nota: '' },
  { id: 2, nombre: 'Cliente principal', codigo: 'CLI-02', total: 20, fecha: '2025-12-31', nota: 'Con observación' },
  { id: 3, nombre: 'Servicio', codigo: 'SER-03', total: 3, fecha: '2026-01-01', nota: '' }
]

class Memoria implements AlmacenVistas {
  readonly datos = new Map<string, string>()
  getItem(clave: string): string | null { return this.datos.get(clave) ?? null }
  setItem(clave: string, valor: string): void { this.datos.set(clave, valor) }
}

const vista = (nombre: string): VistaGuardada => ({
  nombre, busqueda: 'aceite', facetas: { codigo: 'A-01' },
  reglas: [{ id: 'r1', columna: 'total', operador: 'mayor', valor: '10' }],
  orden: { key: 'total', asc: true }
})

describe('normalización y términos de búsqueda', () => {
  it('quita acentos y mayúsculas sin alterar la escritura continua', () => {
    expect(normalizarTexto('  Áceite  ')).toBe('aceite')
    expect(tokensBusqueda('"cliente principal" A-01')).toEqual(['cliente principal', 'a-01'])
    expect(coincideTexto('Cliente Principal · A-01', 'áceite principal')).toBe(false)
    expect(coincideTexto('Cliente Principal · A-01', 'á-01 principal')).toBe(true)
    expect(coincideTexto('Cliente Principal · A-01', '')).toBe(true)
  })
})

describe('filtrado avanzado compartido', () => {
  it('exige todos los términos en cualquier columna', () => {
    expect(filtrarFilas(filas, columnas, 'áceite principal', {}, []).map((f) => f.id)).toEqual([1])
    expect(filtrarFilas(filas, columnas, 'principal A-01', {}, []).map((f) => f.id)).toEqual([1])
    expect(filtrarFilas(filas, columnas, 'principal inexistente', {}, [])).toEqual([])
  })

  it('combina facetas y reglas con rangos numéricos', () => {
    const regla: ReglaFiltro = { id: 'r', columna: 'total', operador: 'entre', valor: '20', valor2: '100' }
    expect(filtrarFilas(filas, columnas, '', {}, [regla]).map((f) => f.id)).toEqual([1, 2])
    expect(filtrarFilas(filas, columnas, '', { codigo: 'CLI-02' }, [regla]).map((f) => f.id)).toEqual([2])
    expect(filtrarFilas(filas, columnas, '', {}, [{ ...regla, valor2: '' }]).map((f) => f.id)).toEqual([1, 2, 3])
  })

  it('filtra celdas vacías y no vacías', () => {
    expect(filtrarFilas(filas, columnas, '', {}, [
      { id: 'v', columna: 'nota', operador: 'vacio', valor: '' }
    ]).map((f) => f.id)).toEqual([1, 3])
    expect(filtrarFilas(filas, columnas, '', {}, [
      { id: 'v', columna: 'nota', operador: 'noVacio', valor: '' }
    ]).map((f) => f.id)).toEqual([2])
  })

  it('ordena fechas e importes por valor y no por texto', () => {
    expect(ordenarFilas(filas, columnas, { key: 'total', asc: true }).map((f) => f.id)).toEqual([3, 2, 1])
    expect(ordenarFilas(filas, columnas, { key: 'fecha', asc: true }).map((f) => f.id)).toEqual([2, 3, 1])
    expect(compararValores('2026-01-02', '2025-12-31')).toBeGreaterThan(0)
  })

  it('ignora reglas incompletas sin romper el listado', () => {
    expect(filtrarFilas(filas, columnas, '', {}, [nuevaRegla(columnas)])).toHaveLength(3)
  })
})

describe('vistas guardadas por tabla', () => {
  it('guarda, reemplaza, aplica y elimina vistas sin datos ajenos', () => {
    const memoria = new Memoria()
    memoria.setItem('erp-vistas-tabla', '{json roto')
    expect(leerVistas('tabla', memoria)).toEqual([])

    expect(guardarVista('tabla', vista('Venta'), memoria)).toHaveLength(1)
    guardarVista('tabla', vista('Venta'), memoria)
    guardarVista('tabla', vista('Compras'), memoria)
    expect(leerVistas('tabla', memoria).map((v) => v.nombre)).toEqual(['Venta', 'Compras'])
    expect(leerVistas('tabla', memoria)[0].reglas[0].operador).toBe('mayor')

    expect(eliminarVista('tabla', 'Venta', memoria).map((v) => v.nombre)).toEqual(['Compras'])
  })

  it('limita el número de vistas para no llenar el almacenamiento', () => {
    const memoria = new Memoria()
    for (let i = 0; i < 15; i += 1) guardarVista('tabla', vista(`Vista ${i}`), memoria)
    expect(leerVistas('tabla', memoria)).toHaveLength(12)
  })
})

import { describe, it, expect } from 'vitest'
import {
  customPermissionCreateSchema, customPermissionDeleteSchema, permissionKeySchema
} from '@shared/schemas/auth'

describe('esquemas de permisos personalizados', () => {
  const valido = {
    key: 'custom.reporte_gerencia',
    label: 'Reporte de gerencia',
    descripcion: 'Permite consultar un panel gerencial personalizado.',
    module: 'reportes',
    critico: false
  }

  it('acepta claves del sistema y del espacio custom reservado', () => {
    expect(permissionKeySchema.parse('ventas.consultar')).toBe('ventas.consultar')
    expect(permissionKeySchema.parse('custom.reporte_gerencia')).toBe('custom.reporte_gerencia')
    expect(() => permissionKeySchema.parse('reporte.inventado')).toThrow()
  })

  it('exige clave, descripción y módulo válidos', () => {
    expect(customPermissionCreateSchema.parse(valido).critico).toBe(false)
    expect(() => customPermissionCreateSchema.parse({ ...valido, key: 'reporte' })).toThrow()
    expect(() => customPermissionCreateSchema.parse({ ...valido, descripcion: 'corto' })).toThrow()
    expect(() => customPermissionCreateSchema.parse({ ...valido, module: 'inexistente' })).toThrow()
    expect(() => customPermissionDeleteSchema.parse({ key: 'custom.reporte_gerencia' })).not.toThrow()
  })
})

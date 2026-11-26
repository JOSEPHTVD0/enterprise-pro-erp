/** Catálogo contable base. Los importes se manejan siempre en centavos enteros. */

export const tiposCuenta = ['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO'] as const
export type TipoCuenta = (typeof tiposCuenta)[number]

export const naturalezas = ['DEUDORA', 'ACREEDORA'] as const
export type Naturaleza = (typeof naturalezas)[number]

export interface CuentaBase {
  codigo: string
  nombre: string
  tipo: TipoCuenta
  naturaleza: Naturaleza
  nivel: number
  aceptaMovimiento: boolean
}

/**
 * Plan mínimo equilibrado: las cuentas de nivel 1 son cabeceras y las de
 * nivel 2/3 aceptan movimiento. `4110` se usa al integrar el ITBIS de ventas.
 */
export const planCuentasBase: readonly CuentaBase[] = [
  { codigo: '1000', nombre: 'ACTIVO', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 1, aceptaMovimiento: false },
  { codigo: '1100', nombre: 'Activo corriente', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 2, aceptaMovimiento: true },
  { codigo: '1110', nombre: 'Efectivo y equivalentes', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '1120', nombre: 'Bancos', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '1130', nombre: 'Cuentas por cobrar', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '1200', nombre: 'Inventarios', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '1500', nombre: 'Activo no corriente', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 2, aceptaMovimiento: true },
  { codigo: '1510', nombre: 'Activos fijos', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '2000', nombre: 'PASIVO', tipo: 'PASIVO', naturaleza: 'ACREEDORA', nivel: 1, aceptaMovimiento: false },
  { codigo: '2100', nombre: 'Pasivo corriente', tipo: 'PASIVO', naturaleza: 'ACREEDORA', nivel: 2, aceptaMovimiento: true },
  { codigo: '2110', nombre: 'Cuentas por pagar', tipo: 'PASIVO', naturaleza: 'ACREEDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '3000', nombre: 'PATRIMONIO', tipo: 'PATRIMONIO', naturaleza: 'ACREEDORA', nivel: 1, aceptaMovimiento: false },
  { codigo: '3100', nombre: 'Capital', tipo: 'PATRIMONIO', naturaleza: 'ACREEDORA', nivel: 2, aceptaMovimiento: true },
  { codigo: '4000', nombre: 'INGRESOS', tipo: 'INGRESO', naturaleza: 'ACREEDORA', nivel: 1, aceptaMovimiento: false },
  { codigo: '4100', nombre: 'Ventas', tipo: 'INGRESO', naturaleza: 'ACREEDORA', nivel: 2, aceptaMovimiento: true },
  { codigo: '4110', nombre: 'ITBIS por cobrar', tipo: 'INGRESO', naturaleza: 'ACREEDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '4120', nombre: 'ITBIS pagado en compras', tipo: 'ACTIVO', naturaleza: 'DEUDORA', nivel: 3, aceptaMovimiento: true },
  { codigo: '5000', nombre: 'GASTOS', tipo: 'GASTO', naturaleza: 'DEUDORA', nivel: 1, aceptaMovimiento: false },
  { codigo: '5100', nombre: 'Costo de ventas', tipo: 'GASTO', naturaleza: 'DEUDORA', nivel: 2, aceptaMovimiento: true },
  { codigo: '5200', nombre: 'Gastos operativos', tipo: 'GASTO', naturaleza: 'DEUDORA', nivel: 2, aceptaMovimiento: true }
]

/** Jerarquía del plan base, reutilizada por la migración y por `seedPlanContable`. */
export const padresPlanCuentasBase: Readonly<Record<string, string>> = {
  '1100': '1000', '1110': '1100', '1120': '1100', '1130': '1100', '1200': '1100',
  '1500': '1000', '1510': '1500',
  '2100': '2000', '2110': '2100',
  '3100': '3000',
  '4100': '4000', '4110': '4100', '4120': '1100',
  '5100': '5000', '5200': '5000'
}

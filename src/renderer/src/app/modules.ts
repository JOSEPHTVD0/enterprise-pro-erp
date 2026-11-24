import {
  LayoutDashboard,
  Palette,
  ReceiptText,
  ScanBarcode,
  FileText,
  ShoppingCart,
  Package,
  Boxes,
  Warehouse,
  Users,
  Truck,
  HandCoins,
  Wallet,
  Landmark,
  Calculator,
  Banknote,
  BarChart3,
  ShieldCheck,
  Settings,
  ScrollText,
  DatabaseBackup,
  type LucideIcon
} from 'lucide-react'

export interface ModuleDef {
  id: string
  label: string
  icon: LucideIcon
  /** Permiso mínimo para ver el módulo. El backend lo vuelve a verificar. */
  permission?: string
  /** Fase del plan en la que el módulo se vuelve funcional. */
  phase: number
  /** true = funcional hoy; false = pendiente de su fase (se muestra honestamente). */
  available: boolean
  description: string
  features: string[]
}

export interface ModuleGroup {
  id: string
  label: string
  modules: ModuleDef[]
}

export const moduleGroups: ModuleGroup[] = [
  {
    id: 'principal',
    label: 'Principal',
    modules: [
      {
        id: 'dashboard',
        label: 'Inicio',
        icon: LayoutDashboard,
        permission: 'dashboard.consultar',
        phase: 2,
        available: true,
        description: 'Panel principal del sistema.',
        features: []
      },
      {
        id: 'apariencia',
        label: 'Apariencia',
        icon: Palette,
        phase: 2,
        available: true,
        description: 'Tema y comportamiento de la interfaz.',
        features: []
      }
    ]
  },
  {
    id: 'ventas',
    label: 'Ventas',
    modules: [
      {
        id: 'facturacion',
        label: 'Facturación',
        icon: ReceiptText,
        permission: 'ventas.consultar',
        phase: 6,
        available: true,
        description: 'Facturas de contado, crédito, notas y devoluciones.',
        features: [
          'Facturas de contado y crédito con cargo real en CxC',
          'Descuentos por línea sujetos a permiso',
          'ITBIS por línea y NCF de series configuradas',
          'Entregas parciales con conduce',
          'Anulación con nota de crédito y reversa de inventario',
          'Impresión nativa y exportación a Excel',
          'Datos listos para impresión sin afirmar certificación DGII'
        ]
      },
      {
        id: 'pos',
        label: 'Punto de Venta',
        icon: ScanBarcode,
        permission: 'pos.consultar',
        phase: 6,
        available: true,
        description: 'Caja rápida con pagos combinados y control de sesión.',
        features: [
          'Carrito con selección de productos y series/lotes',
          'Pago combinado: efectivo, tarjeta, transferencia, cheque',
          'Cálculo automático de cambio',
          'Suspender y recuperar ventas',
          'Apertura y cierre de sesión de caja con monto teórico',
          'Impresión nativa de ticket'
        ]
      },
      {
        id: 'cotizaciones',
        label: 'Cotizaciones y Pedidos',
        icon: FileText,
        permission: 'cotizaciones.consultar',
        phase: 6,
        available: true,
        description: 'Cotizaciones, pedidos y conversiones trazables.',
        features: [
          'Estados: pendiente, aprobada, convertida y anulada',
          'Conversión a pedido y a factura sin duplicar',
          'Vencimiento y observaciones',
          'Impresión nativa y exportación a Excel',
          'Sin efectos en inventario ni en CxC'
        ]
      }
    ]
  },
  {
    id: 'compras',
    label: 'Compras',
    modules: [
      {
        id: 'compras',
        label: 'Compras',
        icon: ShoppingCart,
        permission: 'compras.consultar',
        phase: 7,
        available: true,
        description: 'Solicitudes, órdenes, recepciones, facturas y devoluciones.',
        features: [
          'Solicitudes y órdenes con aprobación y conversión trazable',
          'Recepciones parciales contra la orden de compra',
          'Facturas de contado y crédito con cargo real en CxP',
          'Costo promedio y kardex actualizados en la recepción',
          'Devoluciones y anulaciones con reversa de inventario',
          'Gastos asociados capitalizados al costo',
          'NCF del proveedor solo como referencia; sin certificación DGII'
        ]
      }
    ]
  },
  {
    id: 'inventario',
    label: 'Inventario',
    modules: [
      {
        id: 'productos',
        label: 'Productos',
        icon: Package,
        permission: 'productos.consultar',
        phase: 4,
        available: true,
        description: 'Catálogo de productos, precios e importación.',
        features: [
          'Código, barras, referencia, categoría y marca',
          'Precios 1-3, mayorista y mínimo permitido',
          'Productos compuestos, servicios, series y lotes',
          'Importación desde Excel y exportación',
          'Historial de precios y rentabilidad'
        ]
      },
      {
        id: 'inventario',
        label: 'Existencias y Kardex',
        icon: Warehouse,
        permission: 'inventario.consultar',
        phase: 5,
        available: true,
        description: 'Movimientos, transferencias, ajustes y costos.',
        features: [
          'Existencias por almacén',
          'Kardex valorado a costo promedio',
          'Transferencias, ajustes, conteos y pérdidas',
          'Control de existencias negativas',
          'Inventario valorado y stock mínimo/máximo'
        ]
      }
    ]
  },
  {
    id: 'maestros',
    label: 'Maestros',
    modules: [
      {
        id: 'clientes',
        label: 'Clientes',
        icon: Users,
        permission: 'clientes.consultar',
        phase: 4,
        available: true,
        description: 'Cartera de clientes con crédito e historial.',
        features: [
          'RNC/cédula, límite de crédito y condición de pago',
          'Lista de precios y vendedor asignado',
          'Historial de compras, facturas y pagos',
          'Estado de cuenta y exportación'
        ]
      },
      {
        id: 'proveedores',
        label: 'Proveedores',
        icon: Truck,
        permission: 'proveedores.consultar',
        phase: 4,
        available: true,
        description: 'Proveedores y condiciones de compra.',
        features: [
          'Datos fiscales y de contacto',
          'Condiciones de pago y balance pendiente',
          'Historial de compras y costos'
        ]
      },
      {
        id: 'vendedores',
        label: 'Vendedores',
        icon: HandCoins,
        permission: 'vendedores.consultar',
        phase: 4,
        available: true,
        description: 'Vendedores, comisiones y asignación de clientes.',
        features: [
          'Comisiones por venta, por cobro o por producto',
          'Asignación de clientes',
          'Catálogos de categorías, marcas, unidades y listas de precio'
        ]
      },
      {
        id: 'catalogos',
        label: 'Catálogos',
        icon: Boxes,
        permission: 'productos.consultar',
        phase: 4,
        available: true,
        description: 'Categorías, marcas, unidades y listas de precio.',
        features: [
          'Categorías jerárquicas y marcas',
          'Unidades de medida con decimales configurables',
          'Listas de precio asignables a clientes',
          'Borrado lógico con verificación de referencias'
        ]
      }
    ]
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    modules: [
      {
        id: 'cxc',
        label: 'Cuentas por Cobrar',
        icon: Wallet,
        phase: 8,
        available: true,
        description: 'Cartera, recibos, anticipos y saldos de clientes.',
        features: [
          'Facturas, recibos y anticipos con saldos reales',
          'Recibos con aplicaciones a una o varias facturas',
          'Anticipos de clientes imputables a recibos',
          'Anulación de recibos con motivo y auditoría',
          'Impresión nativa y exportación a XLSX'
        ]
      },
      {
        id: 'cxp',
        label: 'Cuentas por Pagar',
        icon: Calculator,
        phase: 8,
        available: true,
        description: 'Obligaciones con proveedores, pagos y anticipos.',
        features: [
          'Facturas, pagos y anticipos de proveedores',
          'Pagos parciales aplicados a varias facturas',
          'Anticipos de proveedores imputables a pagos',
          'Anulación de pagos con motivo y auditoría',
          'Impresión nativa y exportación a XLSX'
        ]
      },
      {
        id: 'bancos',
        label: 'Bancos',
        icon: Landmark,
        phase: 8,
        available: true,
        description: 'Cuentas bancarias, movimientos y conciliación.',
        features: [
          'Cuentas bancarias con saldo inicial',
          'Depósitos, retiros, transferencias, cheques, cargos e intereses con monto firmado',
          'Conciliación seleccionando movimientos y saldo del banco',
          'Anulación de movimientos con motivo e impresión nativa',
          'Sin exportación'
        ]
      },
      {
        id: 'cajas',
        label: 'Cajas y Cuadre',
        icon: Banknote,
        phase: 8,
        available: true,
        description: 'Apertura, movimientos, arqueo y cierre de caja.',
        features: [
          'Apertura con fondo inicial y movimientos manuales de ingreso/egreso',
          'Cierre con arqueo en efectivo, otros medios y diferencia',
          'Detalle de sesiones e impresión nativa'
        ]
      },
      {
        id: 'gastos',
        label: 'Gastos',
        icon: Banknote,
        phase: 8,
        available: true,
        description: 'Gastos operativos, recurrentes y comisiones.',
        features: [
          'Gastos con categoría, proveedor y pago desde caja o banco',
          'Anulación de gastos con motivo',
          'Gastos recurrentes con generación manual',
          'Comisiones de vendedores sobre ventas y su pago',
          'Sin impresión ni exportación'
        ]
      }
    ]
  },
  {
    id: 'analisis',
    label: 'Análisis',
    modules: [
      {
        id: 'reportes',
        label: 'Reportes',
        icon: BarChart3,
        phase: 9,
        available: true,
        description: 'Centro de informes y estadísticas.',
        features: [
          'Ventas, inventario, finanzas y compras',
          'Libro de ventas y compras (formato DGII)',
          'Gráficos y comparación de períodos',
          'Exportación PDF, Excel y CSV'
        ]
      }
    ]
  },
  {
    id: 'admin',
    label: 'Administración',
    modules: [
      {
        id: 'usuarios',
        label: 'Usuarios',
        icon: ShieldCheck,
        permission: 'seguridad.consultar',
        phase: 3,
        available: true,
        description: 'Cuentas, estados y restablecimiento de contraseñas.',
        features: [
          'Roles con permisos por módulo y operación',
          'Verificación de permisos en el backend',
          'Bloqueo, desactivación y restablecimiento',
          'Consulta de sesiones y actividad'
        ]
      },
      {
        id: 'roles',
        label: 'Roles y Permisos',
        icon: ShieldCheck,
        permission: 'seguridad.consultar',
        phase: 3,
        available: true,
        description: 'Perfiles, permisos y verificaciones de seguridad.',
        features: [
          'Permisos por módulo y operación',
          'Verificación en el backend antes de cada acción',
          'Rol Administrador protegido',
          'Auditoría de cambios de permisos'
        ]
      },
      {
        id: 'configuracion',
        label: 'Configuración',
        icon: Settings,
        permission: 'configuracion.consultar',
        phase: 3,
        available: true,
        description: 'Empresa, impuestos, series y parámetros.',
        features: [
          'Datos de empresa y fiscales (RNC, NCF)',
          'ITBIS, monedas y tasas de cambio',
          'Numeración de documentos',
          'Almacenes, cajas y formatos de impresión',
          'Multi-empresa'
        ]
      },
      {
        id: 'auditoria',
        label: 'Auditoría',
        icon: ScrollText,
        permission: 'auditoria.consultar',
        phase: 3,
        available: true,
        description: 'Registro de toda operación crítica.',
        features: [
          'Usuario, fecha, operación y registro afectado',
          'Valores antes y después de cada cambio',
          'Filtros por usuario, módulo y fecha'
        ]
      },
      {
        id: 'respaldos',
        label: 'Respaldos',
        icon: DatabaseBackup,
        phase: 10,
        available: true,
        description: 'Copias de seguridad y restauración.',
        features: [
          'Respaldos manuales y automáticos',
          'Verificación de integridad',
          'Restauración con doble confirmación',
          'Historial de respaldos'
        ]
      }
    ]
  }
]

export const allModules: ModuleDef[] = moduleGroups.flatMap((g) => g.modules)

export function findModule(id: string): ModuleDef | undefined {
  return allModules.find((m) => m.id === id)
}

/** Permiso que controla la visibilidad de una vista. undefined = accesible a todo usuario autenticado. */
export function modulePermission(id: string): string | undefined {
  const module = findModule(id)
  if (!module) return undefined
  return module.permission ?? (module.id === 'apariencia' ? undefined : `${module.id}.consultar`)
}

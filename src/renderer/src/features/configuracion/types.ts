export interface ConfigRow {
  id?: number
  [key: string]: unknown
}

export interface ConfigData {
  empresas: ConfigRow[]
  empresa: ConfigRow
  parametros: Record<string, string>
  impuestos: ConfigRow[]
  monedas: ConfigRow[]
  tasas: ConfigRow[]
  series: ConfigRow[]
  almacenes: ConfigRow[]
  cajas: ConfigRow[]
  impresoras: ConfigRow[]
  formatos: ConfigRow[]
}

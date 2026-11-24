/** Información real de la aplicación expuesta por el proceso principal. */
export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
  userDataPath: string
}

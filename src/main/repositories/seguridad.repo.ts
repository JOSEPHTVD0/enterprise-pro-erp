import type { Db } from '../db/connection'

export interface UserRow {
  id: number
  username: string
  nombre: string
  email: string
  password_hash: string
  salt: string
  departamento_id: number | null
  activo: number
  bloqueado: number
  debe_cambiar_clave: number
  intentos_fallidos: number
}

export function findUserByUsername(db: Db, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM usuarios WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined
}

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as UserRow | undefined
}

export function listUsers(db: Db): Record<string, unknown>[] {
  return db.prepare(`
    SELECT u.id, u.username, u.nombre, u.email, u.activo, u.bloqueado, u.debe_cambiar_clave,
           u.creado_en, d.nombre AS departamento,
           GROUP_CONCAT(r.nombre, ', ') AS roles
    FROM usuarios u
    LEFT JOIN departamentos d ON d.id = u.departamento_id
    LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
    LEFT JOIN roles r ON r.id = ur.rol_id
    GROUP BY u.id ORDER BY u.id
  `).all() as Record<string, unknown>[]
}

export function insertUser(
  db: Db,
  data: { username: string; nombre: string; email: string; hash: string; salt: string; departamentoId: number | null; activo: boolean }
): number {
  const res = db.prepare(`
    INSERT INTO usuarios (username, nombre, email, password_hash, salt, departamento_id, activo)
    VALUES (@username, @nombre, @email, @hash, @salt, @departamentoId, @activo)
  `).run({ ...data, activo: data.activo ? 1 : 0 })
  return Number(res.lastInsertRowid)
}

export function updateUser(
  db: Db,
  id: number,
  data: { nombre: string; email: string; departamentoId: number | null; activo: boolean }
): void {
  db.prepare(`
    UPDATE usuarios SET nombre = @nombre, email = @email, departamento_id = @departamentoId,
      activo = @activo, actualizado_en = datetime('now') WHERE id = @id
  `).run({ ...data, id, activo: data.activo ? 1 : 0 })
}

export function setPassword(db: Db, id: number, hash: string, salt: string, mustChange: boolean): void {
  db.prepare(`
    UPDATE usuarios SET password_hash = ?, salt = ?, debe_cambiar_clave = ?,
      intentos_fallidos = 0, actualizado_en = datetime('now') WHERE id = ?
  `).run(hash, salt, mustChange ? 1 : 0, id)
}

export function setUserFlags(db: Db, id: number, flags: { activo?: boolean; bloqueado?: boolean }): void {
  const sets: string[] = []
  const values: Record<string, unknown> = { id }
  if (flags.activo !== undefined) { sets.push('activo = @activo'); values.activo = flags.activo ? 1 : 0 }
  if (flags.bloqueado !== undefined) { sets.push('bloqueado = @bloqueado'); values.bloqueado = flags.bloqueado ? 1 : 0 }
  if (sets.length) db.prepare(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = @id`).run(values)
}

export function registerFailedAttempt(db: Db, id: number, attempts: number, block: boolean): void {
  db.prepare(`
    UPDATE usuarios SET intentos_fallidos = ?, bloqueado = CASE WHEN ? THEN 1 ELSE bloqueado END WHERE id = ?
  `).run(attempts, block ? 1 : 0, id)
}

export function clearFailedAttempts(db: Db, id: number): void {
  db.prepare('UPDATE usuarios SET intentos_fallidos = 0 WHERE id = ?').run(id)
}

export function replaceUserRoles(db: Db, userId: number, roles: { rolId: number; empresaId: number }[]): void {
  db.prepare('DELETE FROM usuario_roles WHERE usuario_id = ?').run(userId)
  const ins = db.prepare('INSERT OR IGNORE INTO usuario_roles (usuario_id, rol_id, empresa_id) VALUES (?, ?, ?)')
  for (const r of roles) ins.run(userId, r.rolId, r.empresaId)
}

export function companyName(db: Db, empresaId: number): string {
  const row = db.prepare('SELECT nombre_comercial AS nombre FROM empresas WHERE id = ?').get(empresaId) as { nombre: string } | undefined
  return row?.nombre ?? 'Empresa sin configurar'
}

export function rolesForUser(db: Db, userId: number): { rolId: number; empresaId: number }[] {
  return db.prepare('SELECT rol_id AS rolId, empresa_id AS empresaId FROM usuario_roles WHERE usuario_id = ?')
    .all(userId) as { rolId: number; empresaId: number }[]
}

export function userCompanies(db: Db, userId: number): { id: number; nombre: string }[] {
  return db.prepare(`
    SELECT DISTINCT e.id, e.nombre_comercial AS nombre
    FROM usuario_roles ur JOIN empresas e ON e.id = ur.empresa_id
    WHERE ur.usuario_id = ? AND e.activa = 1 ORDER BY e.id
  `).all(userId) as { id: number; nombre: string }[]
}

export function roleIdsForUser(db: Db, userId: number, empresaId: number): number[] {
  return (db.prepare('SELECT rol_id FROM usuario_roles WHERE usuario_id = ? AND empresa_id = ?')
    .all(userId, empresaId) as { rol_id: number }[]).map((r) => r.rol_id)
}

export function effectivePermissions(db: Db, roleIds: number[], userId: number): { key: string; concedido: number }[] {
  if (!roleIds.length) return []
  const placeholders = roleIds.map(() => '?').join(',')
  const fromRoles = db.prepare(`
    SELECT DISTINCT p.clave AS key FROM rol_permisos rp
    JOIN permisos p ON p.id = rp.permiso_id
    WHERE rp.rol_id IN (${placeholders})
  `).all(...roleIds) as { key: string }[]
  const overrides = db.prepare(`
    SELECT p.clave AS key, o.concedido FROM usuario_permisos_override o
    JOIN permisos p ON p.id = o.permiso_id WHERE o.usuario_id = ?
  `).all(userId) as { key: string; concedido: number }[]
  const map = new Map<string, number>()
  for (const p of fromRoles) map.set(p.key, 1)
  for (const o of overrides) map.set(o.key, o.concedido)
  return [...map].map(([key, concedido]) => ({ key, concedido }))
}

export function listRoles(db: Db, empresaId: number): Record<string, unknown>[] {
  return db.prepare(`
    SELECT r.id, r.nombre, r.descripcion, r.activo, COUNT(rp.permiso_id) AS total_permisos
    FROM roles r LEFT JOIN rol_permisos rp ON rp.rol_id = r.id
    WHERE r.empresa_id = ? GROUP BY r.id ORDER BY r.id
  `).all(empresaId) as Record<string, unknown>[]
}

export function findRole(db: Db, empresaId: number, id: number): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM roles WHERE empresa_id = ? AND id = ?').get(empresaId, id) as Record<string, unknown> | undefined
}

export function findRoleByName(db: Db, empresaId: number, nombre: string): Record<string, unknown> | undefined {
  return db.prepare('SELECT * FROM roles WHERE empresa_id = ? AND nombre = ?').get(empresaId, nombre) as Record<string, unknown> | undefined
}

/** Cuenta roles activos que conservan un permiso, excluyendo el que se está editando. */
export function countRolesWithPermission(
  db: Db,
  empresaId: number,
  permiso: string,
  excluirRolId?: number
): number {
  const filtro = excluirRolId ? ' AND r.id <> ?' : ''
  const args = excluirRolId ? [empresaId, permiso, excluirRolId] : [empresaId, permiso]
  const fila = db.prepare(`
    SELECT COUNT(DISTINCT r.id) AS total
    FROM roles r
    JOIN rol_permisos rp ON rp.rol_id = r.id
    JOIN permisos p ON p.id = rp.permiso_id
    WHERE r.empresa_id = ? AND r.activo = 1 AND p.clave = ?${filtro}
  `).get(...args) as { total: number }
  return Number(fila.total)
}

export function insertRole(db: Db, empresaId: number, nombre: string, descripcion: string): number {
  return Number(db.prepare('INSERT INTO roles (empresa_id, nombre, descripcion) VALUES (?, ?, ?)').run(empresaId, nombre, descripcion).lastInsertRowid)
}

export function updateRole(db: Db, id: number, nombre: string, descripcion: string): void {
  db.prepare('UPDATE roles SET nombre = ?, descripcion = ? WHERE id = ?').run(nombre, descripcion, id)
}

export function setRolePermissions(db: Db, roleId: number, keys: string[]): void {
  db.prepare('DELETE FROM rol_permisos WHERE rol_id = ?').run(roleId)
  const find = db.prepare('SELECT id FROM permisos WHERE clave = ?')
  const ins = db.prepare('INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)')
  for (const key of keys) {
    const p = find.get(key) as { id: number } | undefined
    if (p) ins.run(roleId, p.id)
  }
}

export function permissionKeysForRole(db: Db, roleId: number): string[] {
  return (db.prepare(`
    SELECT p.clave FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = ?
  `).all(roleId) as { clave: string }[]).map((r) => r.clave)
}

export interface CustomPermissionRow {
  id: number
  clave: string
  modulo: string
  operacion: string
  etiqueta: string
  descripcion: string
  critico: number
  empresa_id: number | null
  personalizado: number
}

const customPermissionColumns = `
  id, clave, modulo, operacion, etiqueta, descripcion, critico, empresa_id, personalizado
`

export function listCustomPermissions(db: Db, empresaId: number): CustomPermissionRow[] {
  return db.prepare(`
    SELECT ${customPermissionColumns} FROM permisos
     WHERE personalizado = 1 AND empresa_id = ?
     ORDER BY modulo, etiqueta
  `).all(empresaId) as CustomPermissionRow[]
}

export function findPermissionByKey(db: Db, clave: string): CustomPermissionRow | undefined {
  return db.prepare(`
    SELECT ${customPermissionColumns} FROM permisos WHERE clave = ?
  `).get(clave) as CustomPermissionRow | undefined
}

export function insertCustomPermission(db: Db, input: {
  clave: string
  modulo: string
  etiqueta: string
  descripcion: string
  critico: boolean
  empresaId: number
}): number {
  const res = db.prepare(`
    INSERT INTO permisos (clave, modulo, operacion, etiqueta, descripcion, critico, empresa_id, personalizado)
    VALUES (?, ?, 'personalizado', ?, ?, ?, ?, 1)
  `).run(input.clave, input.modulo, input.etiqueta, input.descripcion, input.critico ? 1 : 0, input.empresaId)
  return Number(res.lastInsertRowid)
}

export function updateCustomPermission(db: Db, id: number, input: {
  etiqueta: string
  descripcion: string
  modulo: string
  critico: boolean
}): void {
  db.prepare(`
    UPDATE permisos
       SET etiqueta = ?, descripcion = ?, modulo = ?, critico = ?
     WHERE id = ? AND personalizado = 1
  `).run(input.etiqueta, input.descripcion, input.modulo, input.critico ? 1 : 0, id)
}

export function deleteCustomPermission(db: Db, id: number): void {
  db.prepare('DELETE FROM permisos WHERE id = ? AND personalizado = 1').run(id)
}

/** El rol Administrador conserva acceso total, incluidos los permisos creados después. */
export function grantPermissionToAdmin(db: Db, empresaId: number, permisoId: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    SELECT id, ? FROM roles WHERE empresa_id = ? AND nombre = 'Administrador'
  `).run(permisoId, empresaId)
}

export function listDepartments(db: Db, empresaId: number): Record<string, unknown>[] {
  return db.prepare('SELECT id, nombre FROM departamentos WHERE empresa_id = ? ORDER BY nombre').all(empresaId) as Record<string, unknown>[]
}

export function insertSession(db: Db, tokenHash: string, userId: number, empresaId: number, equipo: string): number {
  return Number(db.prepare(`
    INSERT INTO sesiones (token_hash, usuario_id, empresa_id, equipo) VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, empresaId, equipo).lastInsertRowid)
}

export interface SessionRow {
  id: number
  token_hash: string
  usuario_id: number
  empresa_id: number
  inicio: string
  ultima_actividad: string
  fin: string | null
}

export function findActiveSession(db: Db, tokenHash: string): SessionRow | undefined {
  return db.prepare('SELECT * FROM sesiones WHERE token_hash = ? AND fin IS NULL').get(tokenHash) as SessionRow | undefined
}

export function touchSession(db: Db, id: number): void {
  db.prepare("UPDATE sesiones SET ultima_actividad = datetime('now') WHERE id = ?").run(id)
}

export function closeSession(db: Db, id: number): void {
  db.prepare("UPDATE sesiones SET fin = datetime('now') WHERE id = ? AND fin IS NULL").run(id)
}

export function closeUserSessions(db: Db, userId: number): void {
  db.prepare('UPDATE sesiones SET fin = datetime(\'now\') WHERE usuario_id = ? AND fin IS NULL').run(userId)
}

export function listSessions(db: Db, empresaId: number): Record<string, unknown>[] {
  return db.prepare(`
    SELECT s.id, s.inicio, s.ultima_actividad, s.fin, s.equipo, u.username, u.nombre
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.empresa_id = ? ORDER BY s.id DESC LIMIT 200
  `).all(empresaId) as Record<string, unknown>[]
}

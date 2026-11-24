import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const KEY_LENGTH = 64
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/** Hash seguro con scrypt + salt único por usuario. */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex')
  return { hash, salt }
}

/** Verificación en tiempo constante. Devuelve false si el hash es inválido. */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const candidate = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS)
    const stored = Buffer.from(hash, 'hex')
    return stored.length === candidate.length && timingSafeEqual(stored, candidate)
  } catch {
    return false
  }
}

/** Los tokens de sesión se guardan hasheados: nunca en texto plano en la BD. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Contraseña temporal segura para restablecimientos (se muestra una sola vez). */
export function temporaryPassword(): string {
  return `Tmp-${randomBytes(9).toString('base64url')}Aa1!`
}

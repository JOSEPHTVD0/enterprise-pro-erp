import { createDatabase } from '../../src/main/db/connection'

/** Base de datos real en memoria con migraciones y seed aplicados. */
export function testDb() {
  return createDatabase(':memory:')
}

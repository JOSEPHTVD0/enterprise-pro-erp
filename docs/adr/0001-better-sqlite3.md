# ADR-0001 — better-sqlite3 como motor de persistencia (aprobado)

- **Estado:** Aceptado (Fase 1, aprobado por el propietario).
- **Contexto:** El brief permitía Prisma ORM o una alternativa estable compatible con SQLite.
- **Decisión:** Usar `better-sqlite3` con migraciones SQL versionadas y repositorios tipados.
- **Motivo:** API síncrona con `db.transaction()` real, mejor rendimiento en escritorio, sin motor
  binario adicional. Los cálculos de costo promedio, kardex y saldos requieren atomicidad estricta.
- **Consecuencias:** El SQL se escribe y revisa manualmente en `src/main/db/migrations`;
  se compensa con SQL parametrizado exclusivamente en repositories, índices en la migración 001
  y pruebas de integración sobre SQLite en memoria. Respaldo tecnológico: `node:sqlite` (Node 24).

# Corrección 0.5.1 — escritura continua en el cambio de contraseña

## Problema
Al iniciar por primera vez, el modal obligatorio de cambio de contraseña
perdía el foco del campo después de cada carácter: el efecto de `Modal`
dependía de `onClose`, una flecha inline que cambiaba de identidad en cada
render. Al escribir una letra, React volvía a renderizar, el efecto se
ejecutaba de nuevo y `panelRef.current.focus()` robaba el foco al input.
El resultado era una escritura "letra por letra" con pausas.

## Solución
- `Modal` guarda `onClose` en un ref y el efecto de teclado/foco solo se
  ejecuta cuando cambia `open`, nunca por renders internos.
- El foco inicial va al primer campo real (`input`, `textarea` o `select`)
  del modal, con el panel como reserva.
- `ChangePasswordModal` y `App` usan un `NOOP` estable en lugar de flechas
  inline.
- La E2E de primer arranque ahora teclea carácter por carácter
  (`pressSequentially`) y verifica el valor completo antes de guardar.

## Verificación
- `npm run typecheck`: correcto.
- `npm test -- --run`: 234/234.
- `npm run test:e2e`: 8/8 (incluye la regresión de escritura continua).
- Instalador `EnterpriseProERP-Setup-0.5.1.exe` firmado con el certificado
  autofirmado: 145.463.160 bytes, SHA-256
  `5AD8D6B2EFD164C18DF27D8DC709B63975F2DE7FBC35517EBD66D5564E5BD922`.
- Feed `release/latest.yml` regenerado con versión `0.5.1` desde el instalador firmado.
- El shim de NSIS ahora fusiona `process.env` incluso cuando electron-builder no
  pasa `env`, evitando el `spawn UNKNOWN` de Node 24 en Windows.

# ADR-0002 — Dinero en centavos enteros (aprobado)

- **Estado:** Aceptado (Fase 1, aprobado por el propietario).
- **Contexto:** Facturación dominicana con ITBIS, descuentos, anticipos y pagos parciales.
- **Decisión:** Almacenar todo importe como `INTEGER` de centavos; las cantidades como REAL con 4 decimales.
- **Motivo:** Evitar errores de coma flotante y discrepancias en book de ventas, CxC/CxP y arqueos.
- **Consecuencias:** Un único módulo `core/dinero` formatea y redondea; la UI muestra `RD$`
  solo en la presentación. Todas las fórmulas financieras se prueban en Vitest antes de usarlas.

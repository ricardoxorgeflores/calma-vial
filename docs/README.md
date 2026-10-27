# /docs — Calma Vial

Notas de diseño y decisiones de producto.

## Decisiones tomadas
- Registro de incidentes manual (no por sensores), por ahora.
- Base de datos: Supabase, proyecto "Agenda" compartido, tablas con prefijo `calmavial_`.
- Auth: Supabase Auth, email + contraseña.
- Escala de intensidad del incidente: 1 (leve) a 5 (fuerte).

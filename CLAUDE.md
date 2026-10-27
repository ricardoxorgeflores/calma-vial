# Calma Vial

Web app vinculada a una app móvil para ayudar a controlar la ira al conducir. Registra momentos de tensión, guía ejercicios de respiración y muestra historial/estadísticas.

## Stack

- **Web app:** Blazor WASM + ASP.NET Core API (mismo patrón que el proyecto de biblioteca de Ricardo).
- **App móvil:** Android nativo en Kotlin.
- **Base de datos:** Supabase (PostgreSQL), dentro del proyecto existente "Agenda" — las tablas de Calma Vial usan el prefijo `calmavial_` para no mezclarse con las de Agenda.
- **API:** API REST autogenerada por Supabase (PostgREST) sobre las tablas `calmavial_*`. Si hace falta lógica personalizada, se agrega como Edge Function de Supabase.

## Estructura de carpetas

```
/web       -> proyecto Blazor WASM + ASP.NET Core API
/mobile    -> proyecto Android (Kotlin)
/db        -> migraciones SQL de Supabase (scripts numerados)
/docs      -> notas de diseño, decisiones de producto
```

## Convenciones

- Código (variables, funciones, clases) en **inglés**.
- Comentarios y textos de interfaz en **español** (la app es para usuarios bolivianos).
- Tablas de base de datos: `snake_case`, prefijo `calmavial_` (ej. `calmavial_incidents`, `calmavial_exercises`).
- Commits en español, formato corto: `tipo: descripción` (ej. `feat: registro manual de incidente`).

## Reglas del dominio

- El registro de un "momento de tensión" es **manual** (el usuario toca un botón), no se usan sensores del celular por ahora.
- Cada incidente guarda: fecha/hora, intensidad (escala simple), y si completó un ejercicio de respiración después.
- La web app es el panel de revisión (historial, estadísticas); el registro en el momento de manejar ocurre en la app móvil.
- Autenticación de usuarios vía Supabase Auth, email + contraseña como método inicial.

## Flujo de trabajo con Claude Code

- Antes de tocar 2+ archivos, mostrar el plan (Plan mode) y esperar confirmación.
- Prompts específicos: nombrar el archivo, el comportamiento esperado y el error visto.
- Usar `/compact` en sesiones largas antes de que las respuestas empiecen a ser inconsistentes.
- Si un mismo error no se resuelve en 2-3 intentos dentro de la misma sesión, parar y reiniciar el enfoque en vez de seguir insistiendo.

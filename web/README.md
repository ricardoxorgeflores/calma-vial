# /web — Calma Vial Web App

Panel de revisión: historial de incidentes y estadísticas.

**Stack:** Blazor WASM + ASP.NET Core API.

**Pendiente:**
- Crear el proyecto con `dotnet new blazorwasm -o CalmaVial.Web`
- Crear la API con `dotnet new webapi -o CalmaVial.Api`
- Conectar con Supabase (URL + anon key) para leer `calmavial_incidents`, `calmavial_exercises`, `calmavial_exercise_logs`.
- Pantallas mínimas: login, historial de incidentes, estadísticas semanales.

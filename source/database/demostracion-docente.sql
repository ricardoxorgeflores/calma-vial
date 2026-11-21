-- CALMA VIAL: DEMOSTRACIÓN PARA EL DOCENTE
-- Solo lectura. Ejecutar cada bloque por separado en SQL Editor.
-- No muestra correos, contraseñas, nombres ni contenido del diario.

-- 1. RESUMEN. Web y Android consultan este mismo proyecto.
select 'Perfiles registrados' as componente, count(*)::text as resultado from public.perfiles
union all
select 'Evaluaciones almacenadas', count(*)::text from public.evaluaciones
union all
select 'Entradas de diario almacenadas', count(*)::text from public.diario
union all
select 'Administradores', count(*)::text from public.perfiles where rol = 'admin'
union all
select 'Estudiantes (rol usuario)', count(*)::text from public.perfiles where rol = 'usuario';

-- 2. ESTRUCTURA: columnas y tipos de las tres tablas compartidas.
select table_name as tabla, column_name as columna, data_type as tipo,
       is_nullable as permite_nulos
from information_schema.columns
where table_schema = 'public'
  and table_name in ('perfiles', 'evaluaciones', 'diario')
order by table_name, ordinal_position;

-- 3. RELACIONES: cada evaluación y diario pertenece a una cuenta.
select c.conrelid::regclass::text as tabla, c.conname as restriccion,
       pg_get_constraintdef(c.oid) as definicion
from pg_constraint c
where c.contype in ('p', 'f')
  and c.conrelid in ('public.perfiles'::regclass,
                    'public.evaluaciones'::regclass, 'public.diario'::regclass)
order by tabla, restriccion;

-- 4. SEGURIDAD: las tres tablas deben mostrar rls_activa = true.
select c.relname as tabla, c.relrowsecurity as rls_activa
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('perfiles', 'evaluaciones', 'diario')
order by c.relname;

-- 5. POLÍTICAS: propietario, administrador y privacidad del diario.
select tablename as tabla, policyname as politica, cmd as operacion,
       roles as roles_postgres, qual as condicion_lectura,
       with_check as condicion_escritura
from pg_policies
where schemaname = 'public' and tablename in ('perfiles', 'evaluaciones', 'diario')
order by tablename, cmd, policyname;

-- 6. VALIDACIONES: se ejecutan en PostgreSQL, también para clientes móviles.
select event_object_table as tabla, trigger_name as validacion,
       event_manipulation as operacion, action_timing as momento
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('perfiles', 'evaluaciones', 'diario')
order by tabla, validacion, operacion;

-- 7. GUARDADO: el RPC evita duplicar evaluaciones ante un reintento.
select n.nspname as esquema, p.proname as funcion,
       pg_get_function_arguments(p.oid) as argumentos,
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end as seguridad
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('guardar_evaluacion', 'es_admin'))
   or (n.nspname = 'calmavial_private' and p.proname in
       ('validate_evaluation', 'validate_profile', 'validate_diary', 'is_admin'))
order by esquema, funcion;

-- 8. SINCRONIZACIÓN: tablas publicadas para Realtime.
-- Esta configuración no demuestra por sí sola la entrega a un teléfono.
select pubname as publicacion, schemaname as esquema, tablename as tabla
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('perfiles', 'evaluaciones', 'diario')
order by tablename;

-- 9. AUTENTICACIÓN: resumen de cuentas vinculadas sin exponer identidades.
select p.rol as rol_aplicacion, count(*) as cuentas,
       count(*) filter (where u.email_confirmed_at is not null) as correos_confirmados
from public.perfiles p join auth.users u on u.id = p.id
group by p.rol order by p.rol;

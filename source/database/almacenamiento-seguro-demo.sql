-- Calma Vial: almacenamiento y seguridad (solo lectura).
-- No devuelve contraseñas, hashes ni datos personales.
select 1 as orden, 'Cuentas y contraseñas' as componente, 'auth.users / encrypted_password' as ubicacion, count(*)::text || ' cuentas vinculadas; ' || count(*) filter (where coalesce(u.encrypted_password, '') <> '')::text || ' con hash de contraseña configurado' as detalle from auth.users u join public.perfiles p on p.id=u.id
union all select 2, 'Perfiles y roles', 'public.perfiles', count(*)::text || ' perfiles; ' || count(*) filter (where rol='admin')::text || ' administradores; ' || count(*) filter (where rol='usuario')::text || ' estudiantes' from public.perfiles
union all select 3, 'Evaluaciones', 'public.evaluaciones', count(*)::text || ' evaluaciones; última: ' || coalesce(max(creado_en)::text,'sin registros') from public.evaluaciones
union all select 4, 'Diario personal', 'public.diario', count(*)::text || ' entradas; última: ' || coalesce(max(creado_en)::text,'sin registros') from public.diario
union all select 5, 'Seguridad por fila', 'PostgreSQL RLS', count(*) filter (where c.relrowsecurity)::text || ' de 3 tablas compartidas con RLS activo' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('perfiles','evaluaciones','diario')
union all select 6, 'Sincronización', 'supabase_realtime', count(*)::text || ' tablas compartidas publicadas' from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('perfiles','evaluaciones','diario')
order by orden;
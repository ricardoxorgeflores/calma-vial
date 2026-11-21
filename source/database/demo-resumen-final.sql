-- Bloque 1: estado agregado, sin identidades ni hashes completos.
select 'Usuarios de prueba restantes' as control,
 count(*)::text as resultado from auth.users where email like 'qa19-%@example.invalid' or email like 'qa-calmavial-%@example.invalid' or email like 'qa-foto-%@example.invalid'
union all select 'Tablas Calma Vial con RLS',count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('perfiles','evaluaciones','diario','calmavial_avisos','calmavial_auditoria') and c.relrowsecurity
union all select 'Archivo privado con RLS',c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='calmavial_private' and c.relname='archivados'
union all select 'Bucket de fotos privado', (not public)::text from storage.buckets where id='calmavial-avatars'
union all select 'Evaluaciones registradas',count(*)::text from public.evaluaciones
union all select 'Cuentas vinculadas con hash bcrypt',count(*) filter(where coalesce(u.encrypted_password,'') ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$')::text || ' / ' || count(*)::text from auth.users u join public.perfiles p on p.id=u.id;

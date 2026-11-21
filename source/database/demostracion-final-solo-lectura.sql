-- Bloque 1: estado agregado, sin identidades ni hashes completos.
select 'Usuarios de prueba restantes' as control,
 count(*)::text as resultado from auth.users where email like 'qa19-%@example.invalid' or email like 'qa-calmavial-%@example.invalid' or email like 'qa-foto-%@example.invalid'
union all select 'Tablas Calma Vial con RLS',count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('perfiles','evaluaciones','diario','calmavial_avisos','calmavial_auditoria') and c.relrowsecurity
union all select 'Archivo privado con RLS',c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='calmavial_private' and c.relname='archivados'
union all select 'Bucket de fotos privado', (not public)::text from storage.buckets where id='calmavial-avatars'
union all select 'Evaluaciones registradas',count(*)::text from public.evaluaciones;

-- Bloque 2: demostrar hash bcrypt sin mostrar valores, correos ni contraseñas.
select p.rol,
 count(*) as cuentas,
 count(*) filter(where coalesce(u.encrypted_password,'') ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$') as con_hash_bcrypt,
 count(*) filter(where u.email_confirmed_at is not null) as correo_confirmado
from public.perfiles p join auth.users u on u.id=p.id group by p.rol order by p.rol;

-- Bloque 3: claves y relaciones reales.
select conrelid::regclass::text as tabla,conname as restriccion,pg_get_constraintdef(oid) as definicion
from pg_constraint where contype in ('p','f') and conrelid in ('public.perfiles'::regclass,'public.evaluaciones'::regclass,'public.diario'::regclass)
order by tabla,restriccion;

-- Bloque 4: funciones y restricciones de ejecución.
select n.nspname as esquema,p.proname as funcion,p.prosecdef as ejecuta_como_propietario,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_puede_ejecutar,p.proconfig as configuracion
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('guardar_evaluacion','calmavial_informe','calmavial_archivar','calmavial_restaurar','calmavial_papelera'))
or (n.nspname='calmavial_private' and p.proname in ('informe','cambiar_archivo','registro_visible','listar_archivados'))
order by esquema,funcion;

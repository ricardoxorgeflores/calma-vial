-- Solo lectura. Mostrar protección de contraseñas sin exponer hashes ni identidades.
select 'Contraseñas con formato bcrypt' as comprobacion,
 count(*) filter(where coalesce(u.encrypted_password,'') ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$')::text || ' de ' || count(*) filter(where coalesce(u.encrypted_password,'')<>'')::text as resultado
from auth.users u join public.perfiles p on p.id=u.id
union all select 'Ubicación de los hashes','auth.users.encrypted_password (solo Supabase Auth)'
union all select 'Versión vigente del cuestionario',id::text from public.calmavial_cuestionarios where vigente
union all select 'Preguntas por evaluación',jsonb_array_length(preguntas)::text from public.calmavial_cuestionarios where vigente
union all select 'Columnas de contraseña en perfiles',count(*)::text from information_schema.columns where table_schema='public' and table_name='perfiles' and column_name ilike '%password%';

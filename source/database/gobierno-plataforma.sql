-- Calma Vial 3.1: versiones de textos, acceso recuperable y diagnóstico agregado.
-- No cambia columnas compartidas con Android ni elimina cuentas de Auth.
begin;
create table calmavial_private.usuarios_eliminados (
 usuario_id uuid primary key references public.perfiles(id),
 actor_id uuid not null references public.perfiles(id),
 motivo text not null check(length(btrim(motivo)) between 10 and 300),
 creado_en timestamptz not null default now()
);
alter table calmavial_private.usuarios_eliminados enable row level security;
revoke all on calmavial_private.usuarios_eliminados from public,anon,authenticated;

create function calmavial_private.cuenta_activa() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from calmavial_private.usuarios_eliminados where usuario_id=auth.uid());
$$;
revoke all on function calmavial_private.cuenta_activa() from public,anon;
grant execute on function calmavial_private.cuenta_activa() to authenticated;
create function public.calmavial_cuenta_activa() returns boolean
language sql stable security invoker set search_path='' as $$ select calmavial_private.cuenta_activa(); $$;
revoke all on function public.calmavial_cuenta_activa() from public,anon;
grant execute on function public.calmavial_cuenta_activa() to authenticated;
create or replace function calmavial_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select calmavial_private.cuenta_activa() and exists(select 1 from public.perfiles where id=auth.uid() and rol='admin');
$$;

create function public.calmavial_estado_usuarios() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not calmavial_private.is_admin() then raise exception 'Se requiere administración.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('usuario_id',usuario_id,'motivo',motivo,'creado_en',creado_en)) from calmavial_private.usuarios_eliminados),'[]'::jsonb);
end $$;
create function public.calmavial_cambiar_usuario(p_usuario_id uuid,p_eliminar boolean,p_motivo text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 if not calmavial_private.is_admin() then raise exception 'Se requiere administración.' using errcode='42501'; end if;
 if p_eliminar is null or p_motivo is null or length(btrim(p_motivo)) not between 10 and 300 then raise exception 'Escribe un motivo de 10 a 300 caracteres.'; end if;
 select rol into v_role from public.perfiles where id=p_usuario_id for update;
 if v_role is distinct from 'usuario' or p_usuario_id=auth.uid() then raise exception 'Solo puedes gestionar cuentas de usuario; no administradores ni tu propia cuenta.'; end if;
 if p_eliminar then
  if exists(select 1 from calmavial_private.usuarios_eliminados where usuario_id=p_usuario_id) then raise exception 'El usuario ya está eliminado.'; end if;
  insert into calmavial_private.usuarios_eliminados(usuario_id,actor_id,motivo) values(p_usuario_id,auth.uid(),btrim(p_motivo));
 else
  delete from calmavial_private.usuarios_eliminados where usuario_id=p_usuario_id;
  if not found then raise exception 'El usuario ya está activo.'; end if;
 end if;
 insert into public.calmavial_gestion_auditoria(actor_id,recurso,registro_id,accion,anterior)
 values(auth.uid(),'cuenta',p_usuario_id,case when p_eliminar then 'eliminar_acceso' else 'restaurar_acceso' end,jsonb_build_object('motivo',btrim(p_motivo)));
 return true;
end $$;
revoke all on function public.calmavial_estado_usuarios(),public.calmavial_cambiar_usuario(uuid,boolean,text) from public,anon;
grant execute on function public.calmavial_estado_usuarios(),public.calmavial_cambiar_usuario(uuid,boolean,text) to authenticated;

-- Una sesión JWT existente tampoco podrá leer/escribir los recursos de Calma Vial.
do $$ declare t text; begin
 foreach t in array array['perfiles','evaluaciones','diario','calmavial_avisos','calmavial_auditoria','calmavial_sugerencias','calmavial_respuestas','calmavial_gestion_auditoria'] loop
  execute format('create policy calmavial_cuenta_habilitada on public.%I as restrictive for all to authenticated using ((select calmavial_private.cuenta_activa())) with check ((select calmavial_private.cuenta_activa()))',t);
 end loop;
end $$;
create policy calmavial_foto_cuenta_habilitada on storage.objects as restrictive for all to authenticated
using(bucket_id<>'calmavial-avatars' or (select calmavial_private.cuenta_activa()))
with check(bucket_id<>'calmavial-avatars' or (select calmavial_private.cuenta_activa()));
-- Los RPC privados SECURITY DEFINER comprueban explícitamente el acceso retirado.
do $$ declare r record; v_definition text; begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='calmavial_private' and p.proname in ('informe','cambiar_archivo','listar_archivados') loop
  v_definition:=pg_get_functiondef(r.oid);
  v_definition:=regexp_replace(v_definition,'\mbegin\M',E'begin\n if not calmavial_private.cuenta_activa() then raise exception ''El acceso de esta cuenta fue retirado.'' using errcode=''42501''; end if;','i');
  execute v_definition;
 end loop;
end $$;

create table public.calmavial_cuestionarios (
 id bigint generated always as identity primary key,
 preguntas jsonb not null check(jsonb_typeof(preguntas)='array' and jsonb_array_length(preguntas)=14),
 motivo text not null check(length(btrim(motivo)) between 10 and 300),
 vigente boolean not null default true,
 creado_por uuid,
 creado_en timestamptz not null default now()
);
create unique index calmavial_cuestionario_vigente on public.calmavial_cuestionarios(vigente) where vigente;
alter table public.calmavial_cuestionarios enable row level security;
revoke all on public.calmavial_cuestionarios from public,anon,authenticated;
grant select on public.calmavial_cuestionarios to authenticated;
create policy cuestionarios_lee on public.calmavial_cuestionarios for select to authenticated using((select calmavial_private.cuenta_activa()));
insert into public.calmavial_cuestionarios(preguntas,motivo) values ('["Alguien está conduciendo en zigzag.","Un vehículo lento que circula por una carretera de montaña no se hace a un lado, de forma que no deja pasar a los autos que van detrás.","Alguien que está delante de ti da marcha atrás sin mirar.","Alguien se pasa un semáforo en rojo o una señal de PARE.","Yendo a más velocidad de la permitida, te das cuenta de que había un radar de control de velocidad.","Alguien acelera justo cuando intentas rebasarlo.","Alguien está estacionando muy despacio y provoca una trancadera.","Te encuentras en medio de una gran trancadera (atasco).","Alguien te hace un gesto obsceno por tu forma de conducir.","Alguien te toca la bocina por tu forma de conducir.","Un ciclista circula por la mitad del carril y hace más lento el tráfico.","Un policía te ordena que te detengas a un lado de la vía.","Un camión pesado lanza gravilla de la calzada sobre tu auto.","Estás conduciendo detrás de un camión grande que no te deja ver lo que hay delante."]'::jsonb,'Versión original compatible con Android');
create table public.calmavial_evaluacion_version (
 evaluacion_id bigint primary key references public.evaluaciones(id) on delete cascade,
 cuestionario_id bigint not null references public.calmavial_cuestionarios(id)
);
alter table public.calmavial_evaluacion_version enable row level security;
revoke all on public.calmavial_evaluacion_version from public,anon,authenticated;
grant select on public.calmavial_evaluacion_version to authenticated;
create policy version_lee on public.calmavial_evaluacion_version for select to authenticated using(
 (select calmavial_private.cuenta_activa()) and exists(select 1 from public.evaluaciones e where e.id=evaluacion_id)
);
insert into public.calmavial_evaluacion_version select id,1 from public.evaluaciones;
create function calmavial_private.versionar_evaluacion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.calmavial_evaluacion_version values(new.id,1);
 return new;
end $$;
revoke all on function calmavial_private.versionar_evaluacion() from public,anon,authenticated;
create trigger calmavial_version after insert on public.evaluaciones for each row execute function calmavial_private.versionar_evaluacion();
create function public.calmavial_publicar_preguntas(p_preguntas jsonb,p_motivo text,p_base bigint) returns public.calmavial_cuestionarios
language plpgsql security definer set search_path='' as $$
declare v_row public.calmavial_cuestionarios; v_item jsonb; v_current bigint;
begin
 if not calmavial_private.is_admin() then raise exception 'Se requiere administración.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(310019);
 select id into v_current from public.calmavial_cuestionarios where vigente;
 if v_current is distinct from p_base then raise exception 'Otra persona publicó cambios. Actualiza antes de publicar.'; end if;
 if jsonb_typeof(p_preguntas) is distinct from 'array' or jsonb_array_length(p_preguntas)<>14 then raise exception 'Se requieren exactamente 14 preguntas.'; end if;
 if p_motivo is null or length(btrim(p_motivo)) not between 10 and 300 then raise exception 'Escribe el motivo de la actualización.'; end if;
 for v_item in select value from jsonb_array_elements(p_preguntas) loop
  if jsonb_typeof(v_item) is distinct from 'string' or length(btrim(v_item#>>'{}')) not between 15 and 700 or (v_item#>>'{}') ~ '[<>[:cntrl:]]' or (v_item#>>'{}') !~ '[[:alpha:]]' then raise exception 'Cada pregunta debe tener entre 15 y 700 caracteres de texto válido.'; end if;
 end loop;
 if (select count(distinct lower(btrim(value#>>'{}'))) from jsonb_array_elements(p_preguntas))<>14 then raise exception 'No repitas preguntas.'; end if;
 if p_preguntas=(select preguntas from public.calmavial_cuestionarios where vigente) then raise exception 'No hay cambios para publicar.'; end if;
 update public.calmavial_cuestionarios set vigente=false where vigente;
 insert into public.calmavial_cuestionarios(preguntas,motivo,creado_por) values(p_preguntas,btrim(p_motivo),auth.uid()) returning * into v_row;
 insert into public.calmavial_gestion_auditoria(actor_id,recurso,registro_id,accion,anterior)
 values(auth.uid(),'cuestionario',gen_random_uuid(),'publicar_version',jsonb_build_object('anterior',v_current,'nueva',v_row.id,'motivo',btrim(p_motivo)));
 return v_row;
end $$;
revoke all on function public.calmavial_publicar_preguntas(jsonb,text,bigint) from public,anon;
grant execute on function public.calmavial_publicar_preguntas(jsonb,text,bigint) to authenticated;
create function public.guardar_evaluacion_versionada(p_request_id uuid,p_respuestas integer[],p_momento text,p_vehiculo text,p_animo integer,p_version bigint)
returns setof public.evaluaciones language plpgsql security definer set search_path='' as $$
declare v_row public.evaluaciones; v_previous boolean; v_version bigint;
begin
 if not calmavial_private.cuenta_activa() then raise exception 'El acceso de esta cuenta fue retirado.' using errcode='42501'; end if;
 if not exists(select 1 from public.perfiles where id=auth.uid()) then raise exception 'Completa tu perfil.'; end if;
 if not exists(select 1 from public.calmavial_cuestionarios where id=p_version) then raise exception 'La versión del cuestionario no existe.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 v_previous:=exists(select 1 from calmavial_private.evaluation_requests where usuario_id=auth.uid() and request_id=p_request_id);
 select * into v_row from public.guardar_evaluacion(p_request_id,p_respuestas,p_momento,p_vehiculo,p_animo);
 select cuestionario_id into v_version from public.calmavial_evaluacion_version where evaluacion_id=v_row.id;
 if v_previous and v_version<>p_version then raise exception 'La solicitud ya fue guardada con otra versión.'; end if;
 if not v_previous then update public.calmavial_evaluacion_version set cuestionario_id=p_version where evaluacion_id=v_row.id; end if;
 return next v_row;
end $$;
revoke all on function public.guardar_evaluacion_versionada(uuid,integer[],text,text,integer,bigint) from public,anon;
grant execute on function public.guardar_evaluacion_versionada(uuid,integer[],text,text,integer,bigint) to authenticated;

-- Validación de perfil en servidor: se aplica a la web y a las escrituras Android.
create function calmavial_private.validar_identificacion() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v text;
begin
 foreach v in array array[new.nombres,new.apellido_paterno,new.apellido_materno] loop
  if v is not null and btrim(v)<>'' and (length(btrim(v))<2 or v !~ '^[[:alpha:]][[:alpha:] ''’.-]*$' or v ~ '[.]{2,}|[-]{2,}') then raise exception 'Nombres y apellidos: mínimo 2 caracteres, solo letras y separadores válidos.'; end if;
 end loop;
 if new.usuario is not null and btrim(new.usuario)<>'' and new.usuario !~ '^[[:alnum:]_.-]{3,50}$' then raise exception 'Nombre de usuario inválido.'; end if;
 if new.documento is not null and btrim(new.documento)<>'' and (new.documento !~ '^[[:alnum:]][[:alnum:] .-]{3,29}$' or new.documento !~ '[[:digit:]]') then raise exception 'Documento inválido: utiliza de 4 a 30 caracteres y al menos un número.'; end if;
 if new.direccion is not null and btrim(new.direccion)<>'' and (length(btrim(new.direccion))<5 or new.direccion ~ '[<>[:cntrl:]]' or new.direccion !~ '[[:alpha:]]') then raise exception 'Escribe una dirección de al menos 5 caracteres.'; end if;
 if new.genero is not null and btrim(new.genero)<>'' and new.genero not in ('Masculino','Femenino','Otro','Prefiero no decirlo') then raise exception 'Selecciona un género válido.'; end if;
 return new;
end $$;
revoke all on function calmavial_private.validar_identificacion() from public,anon,authenticated;
create trigger calmavial_identificacion before insert or update on public.perfiles for each row execute function calmavial_private.validar_identificacion();

create function public.calmavial_diagnostico() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not calmavial_private.is_admin() then raise exception 'Se requiere administración.' using errcode='42501'; end if;
 return jsonb_build_object('comprobado_en',now(),'conexion','ok',
 'version_cuestionario',(select id from public.calmavial_cuestionarios where vigente),
 'usuarios_eliminados',(select count(*) from calmavial_private.usuarios_eliminados),
 'cuentas_con_password',(select count(*) from auth.users u join public.perfiles p on p.id=u.id where coalesce(u.encrypted_password,'')<>''),
 'hashes_bcrypt',(select count(*) from auth.users u join public.perfiles p on p.id=u.id where u.encrypted_password ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$'),
 'tablas_rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('perfiles','evaluaciones','diario','calmavial_sugerencias','calmavial_respuestas','calmavial_cuestionarios','calmavial_evaluacion_version') and c.relrowsecurity),
 'auditoria',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select recurso,accion,creado_en from public.calmavial_gestion_auditoria order by creado_en desc,id desc limit 15) x));
end $$;
revoke all on function public.calmavial_diagnostico() from public,anon;
grant execute on function public.calmavial_diagnostico() to authenticated;
commit;
select 'GOBIERNO_PLATAFORMA_3_1_CONFIGURADO' as resultado;

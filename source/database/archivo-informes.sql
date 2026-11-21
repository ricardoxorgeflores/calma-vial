-- Ampliación compatible con el APK: no añade columnas a perfiles/evaluaciones/diario.
begin;
create table calmavial_private.archivados (
 tipo text not null check (tipo in ('evaluaciones','diario')),
 registro_id bigint not null check (registro_id>0),
 usuario_id uuid not null references auth.users(id) on delete cascade,
 archivado_en timestamptz not null default now(),
 primary key(tipo,registro_id)
);
create index calmavial_archivados_owner_idx on calmavial_private.archivados(usuario_id,archivado_en desc);
alter table calmavial_private.archivados enable row level security;
revoke all on calmavial_private.archivados from public,anon,authenticated;

create function calmavial_private.registro_visible(p_tipo text,p_id bigint,p_owner uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_owner is null or p_tipo not in ('evaluaciones','diario') or (p_owner<>auth.uid() and not(p_tipo='evaluaciones' and calmavial_private.is_admin())) then return false; end if;
 return not exists(select 1 from calmavial_private.archivados where tipo=p_tipo and registro_id=p_id and usuario_id=p_owner);
end $$;
revoke all on function calmavial_private.registro_visible(text,bigint,uuid) from public,anon;
grant execute on function calmavial_private.registro_visible(text,bigint,uuid) to authenticated;

create function calmavial_private.cambiar_archivo(p_tipo text,p_id bigint,p_archivar boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 if p_tipo='evaluaciones' then select usuario_id into v_owner from public.evaluaciones where id=p_id for update;
 elsif p_tipo='diario' then select usuario_id into v_owner from public.diario where id=p_id for update;
 else raise exception 'Tipo de registro no válido.' using errcode='22023'; end if;
 if v_owner is null or v_owner<>auth.uid() then raise exception 'No tienes acceso al registro.' using errcode='42501'; end if;
 if p_archivar then
  insert into calmavial_private.archivados(tipo,registro_id,usuario_id) values(p_tipo,p_id,auth.uid()) on conflict(tipo,registro_id) do nothing;
 else delete from calmavial_private.archivados where tipo=p_tipo and registro_id=p_id and usuario_id=auth.uid(); end if;
 return true;
end $$;
revoke all on function calmavial_private.cambiar_archivo(text,bigint,boolean) from public,anon;
grant execute on function calmavial_private.cambiar_archivo(text,bigint,boolean) to authenticated;

create function public.calmavial_archivar(p_tipo text,p_id bigint)
returns boolean language sql security invoker set search_path='' as $$ select calmavial_private.cambiar_archivo(p_tipo,p_id,true); $$;
create function public.calmavial_restaurar(p_tipo text,p_id bigint)
returns boolean language sql security invoker set search_path='' as $$ select calmavial_private.cambiar_archivo(p_tipo,p_id,false); $$;
revoke all on function public.calmavial_archivar(text,bigint),public.calmavial_restaurar(text,bigint) from public,anon;
grant execute on function public.calmavial_archivar(text,bigint),public.calmavial_restaurar(text,bigint) to authenticated;

create function calmavial_private.listar_archivados() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(item order by item->>'archivado_en' desc) from (
  select jsonb_build_object('tipo',a.tipo,'id',a.registro_id::text,'archivado_en',a.archivado_en,'detalle','Evaluación: '||e.total||'/70 - '||e.nivel) item
   from calmavial_private.archivados a join public.evaluaciones e on e.id=a.registro_id and e.usuario_id=a.usuario_id where a.tipo='evaluaciones' and a.usuario_id=auth.uid()
  union all
  select jsonb_build_object('tipo',a.tipo,'id',a.registro_id::text,'archivado_en',a.archivado_en,'detalle',left(d.situacion,180))
   from calmavial_private.archivados a join public.diario d on d.id=a.registro_id and d.usuario_id=a.usuario_id where a.tipo='diario' and a.usuario_id=auth.uid()
 ) items), '[]'::jsonb);
end $$;
revoke all on function calmavial_private.listar_archivados() from public,anon;
grant execute on function calmavial_private.listar_archivados() to authenticated;
create function public.calmavial_papelera() returns jsonb
language sql stable security invoker set search_path='' as $$ select calmavial_private.listar_archivados(); $$;
revoke all on function public.calmavial_papelera() from public,anon;
grant execute on function public.calmavial_papelera() to authenticated;

-- La app Android también deja de ver lo archivado al volver a consultar las tablas.
alter policy eval_lee on public.evaluaciones using (
 (usuario_id=(select auth.uid()) or (select public.es_admin())) and calmavial_private.registro_visible('evaluaciones',id,usuario_id)
);
alter policy diario_lee on public.diario using (
 usuario_id=(select auth.uid()) and calmavial_private.registro_visible('diario',id,usuario_id)
);

create function calmavial_private.limpiar_archivo() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from calmavial_private.archivados where tipo=tg_table_name and registro_id=old.id;
 return old;
end $$;
revoke all on function calmavial_private.limpiar_archivo() from public,anon,authenticated;
create trigger calmavial_cleanup_archivo after delete on public.evaluaciones for each row execute function calmavial_private.limpiar_archivo();
create trigger calmavial_cleanup_archivo after delete on public.diario for each row execute function calmavial_private.limpiar_archivo();

create function calmavial_private.informe(p_usuario_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_count integer; v_rows jsonb; v_name text;
begin
 if auth.uid() is null or p_usuario_id is null or (p_usuario_id<>auth.uid() and not calmavial_private.is_admin()) then
  raise exception 'No tienes acceso a este informe.' using errcode='42501';
 end if;
 with validas as materialized (
  select e.* from public.evaluaciones e where e.usuario_id=p_usuario_id
  and cardinality(e.respuestas)=14 and array_ndims(e.respuestas)=1 and array_lower(e.respuestas,1)=1
  and not exists(select 1 from unnest(e.respuestas) r where r is null or r not between 1 and 5)
  and not exists(select 1 from calmavial_private.archivados a where a.tipo='evaluaciones' and a.registro_id=e.id and a.usuario_id=p_usuario_id)
 ), ultimas as (select * from validas order by creado_en desc,id desc limit 3)
 select (select count(*) from validas), (select jsonb_agg(jsonb_build_object('id',id::text,'creado_en',creado_en,'respuestas',respuestas) order by creado_en desc,id desc) from ultimas)
 into v_count,v_rows;
 if v_count<3 then raise exception 'Necesitas al menos 3 evaluaciones válidas y no archivadas para generar el informe.' using errcode='22023'; end if;
 select btrim(concat_ws(' ',nombres,apellido_paterno,apellido_materno)) into v_name from public.perfiles where id=p_usuario_id;
 return jsonb_build_object('version',1,'usuario_id',p_usuario_id,'nombre',coalesce(nullif(v_name,''),'Usuario de Calma Vial'),'generado_en',now(),'total_evaluaciones',v_count,'evaluaciones',v_rows);
end $$;
revoke all on function calmavial_private.informe(uuid) from public,anon;
grant execute on function calmavial_private.informe(uuid) to authenticated;
create function public.calmavial_informe(p_usuario_id uuid default auth.uid()) returns jsonb
language sql stable security invoker set search_path='' as $$ select calmavial_private.informe(p_usuario_id); $$;
revoke all on function public.calmavial_informe(uuid) from public,anon;
grant execute on function public.calmavial_informe(uuid) to authenticated;
commit;
select 'ARCHIVO_E_INFORMES_CONFIGURADOS' as resultado;

-- Baja recuperable de Calma Vial; no elimina la identidad compartida de Auth.
begin;
create table calmavial_private.usuarios_baja (
 usuario_id uuid primary key references public.perfiles(id),
 actor_id uuid not null references public.perfiles(id),
 motivo text not null check(length(btrim(motivo)) between 10 and 300),
 creado_en timestamptz not null default now()
);
alter table calmavial_private.usuarios_baja enable row level security;
revoke all on calmavial_private.usuarios_baja from public,anon,authenticated;
create or replace function calmavial_private.cuenta_activa() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and not exists(select 1 from calmavial_private.usuarios_eliminados where usuario_id=auth.uid())
 and not exists(select 1 from calmavial_private.usuarios_baja where usuario_id=auth.uid());
$$;
create function calmavial_private.baja_usuario(p_usuario_id uuid,p_restaurar boolean,p_motivo text,p_confirmacion text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 if not calmavial_private.is_admin() then raise exception 'Se requiere administración.' using errcode='42501'; end if;
 if p_restaurar is null or p_motivo is null or length(btrim(p_motivo)) not between 10 and 300 then raise exception 'Escribe un motivo de 10 a 300 caracteres.'; end if;
 if p_confirmacion is distinct from (case when p_restaurar then 'RESTAURAR' else 'ELIMINAR' end) then raise exception 'La confirmación no coincide.'; end if;
 select rol into v_role from public.perfiles where id=p_usuario_id for update;
 if v_role is distinct from 'usuario' or p_usuario_id=auth.uid() then raise exception 'Solo puedes eliminar o restaurar usuarios; no administradores ni tu propia cuenta.' using errcode='42501'; end if;
 if p_restaurar then
  delete from calmavial_private.usuarios_baja where usuario_id=p_usuario_id;
  if not found then raise exception 'El usuario ya está en el directorio.'; end if;
 else
  if exists(select 1 from calmavial_private.usuarios_baja where usuario_id=p_usuario_id) then raise exception 'El usuario ya está eliminado.'; end if;
  insert into calmavial_private.usuarios_baja(usuario_id,actor_id,motivo) values(p_usuario_id,auth.uid(),btrim(p_motivo));
 end if;
 insert into public.calmavial_gestion_auditoria(actor_id,recurso,registro_id,accion,anterior)
 values(auth.uid(),'cuenta',p_usuario_id,case when p_restaurar then 'restaurar_usuario' else 'eliminar_usuario' end,jsonb_build_object('motivo',btrim(p_motivo)));
 return true;
end $$;
create function calmavial_private.usuarios_baja_listado() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not calmavial_private.is_admin() then raise exception 'Se requiere administración.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('usuario_id',usuario_id,'motivo',motivo,'creado_en',creado_en) order by creado_en desc) from calmavial_private.usuarios_baja),'[]'::jsonb);
end $$;
create function public.calmavial_baja_usuario(p_usuario_id uuid,p_restaurar boolean,p_motivo text,p_confirmacion text) returns boolean
language sql security invoker set search_path='' as $$ select calmavial_private.baja_usuario(p_usuario_id,p_restaurar,p_motivo,p_confirmacion); $$;
create function public.calmavial_usuarios_baja() returns jsonb
language sql stable security invoker set search_path='' as $$ select calmavial_private.usuarios_baja_listado(); $$;
revoke all on function calmavial_private.baja_usuario(uuid,boolean,text,text),calmavial_private.usuarios_baja_listado(),public.calmavial_baja_usuario(uuid,boolean,text,text),public.calmavial_usuarios_baja() from public,anon;
grant execute on function calmavial_private.baja_usuario(uuid,boolean,text,text),calmavial_private.usuarios_baja_listado(),public.calmavial_baja_usuario(uuid,boolean,text,text),public.calmavial_usuarios_baja() to authenticated;
commit;

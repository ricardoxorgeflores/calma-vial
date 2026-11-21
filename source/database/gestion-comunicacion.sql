-- Ampliación administrativa revisable. Conserva las columnas compartidas con Android.
begin;

create table public.calmavial_sugerencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  creado_por uuid not null references public.perfiles(id),
  asunto text not null check (length(btrim(asunto)) between 5 and 120),
  mensaje text not null check (length(btrim(mensaje)) between 10 and 3000),
  tipo text not null default 'sugerencia' check (tipo in ('sugerencia','consulta','seguimiento')),
  estado text not null default 'abierta' check (estado in ('abierta','en_revision','resuelta')),
  evaluacion_id bigint references public.evaluaciones(id) on delete set null,
  eliminado boolean not null default false,
  moderado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create table public.calmavial_respuestas (
  id uuid primary key default gen_random_uuid(),
  sugerencia_id uuid not null references public.calmavial_sugerencias(id),
  autor_id uuid not null references public.perfiles(id),
  mensaje text not null check (length(btrim(mensaje)) between 5 and 3000),
  eliminado boolean not null default false,
  moderado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create table public.calmavial_gestion_auditoria (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  recurso text not null,
  registro_id uuid not null,
  accion text not null,
  anterior jsonb,
  creado_en timestamptz not null default now()
);
alter table public.calmavial_sugerencias enable row level security;
alter table public.calmavial_respuestas enable row level security;
alter table public.calmavial_gestion_auditoria enable row level security;
revoke all on public.calmavial_sugerencias,public.calmavial_respuestas,public.calmavial_gestion_auditoria from public,anon,authenticated;
grant select,insert,update on public.calmavial_sugerencias,public.calmavial_respuestas to authenticated;
grant select on public.calmavial_gestion_auditoria to authenticated;

create policy calmavial_sugerencias_read on public.calmavial_sugerencias for select to authenticated
  using (usuario_id=(select auth.uid()) or (select public.es_admin()));
create policy calmavial_sugerencias_insert on public.calmavial_sugerencias for insert to authenticated
  with check (creado_por=(select auth.uid()) and (usuario_id=(select auth.uid()) or (select public.es_admin())));
create policy calmavial_sugerencias_update on public.calmavial_sugerencias for update to authenticated
  using (usuario_id=(select auth.uid()) or (select public.es_admin()))
  with check (usuario_id=(select auth.uid()) or (select public.es_admin()));

create policy calmavial_respuestas_read on public.calmavial_respuestas for select to authenticated
  using (exists (select 1 from public.calmavial_sugerencias s where s.id=sugerencia_id and (s.usuario_id=(select auth.uid()) or (select public.es_admin()))));
create policy calmavial_respuestas_insert on public.calmavial_respuestas for insert to authenticated
  with check (autor_id=(select auth.uid()) and exists (select 1 from public.calmavial_sugerencias s where s.id=sugerencia_id and not s.eliminado and (s.usuario_id=(select auth.uid()) or (select public.es_admin()))));
create policy calmavial_respuestas_update on public.calmavial_respuestas for update to authenticated
  using ((autor_id=(select auth.uid()) or (select public.es_admin())) and exists (select 1 from public.calmavial_sugerencias s where s.id=sugerencia_id and (s.usuario_id=(select auth.uid()) or (select public.es_admin()))))
  with check ((autor_id=(select auth.uid()) or (select public.es_admin())) and exists (select 1 from public.calmavial_sugerencias s where s.id=sugerencia_id and (s.usuario_id=(select auth.uid()) or (select public.es_admin()))));
create policy calmavial_gestion_audit_read on public.calmavial_gestion_auditoria for select to authenticated
  using ((select public.es_admin()));

-- Esta es la ampliación de edición administrativa: los triggers existentes siguen
-- prohibiendo modificar id, rol, correo y código institucional desde el cliente.
create policy perfil_admin_edita on public.perfiles for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create function calmavial_private.controlar_comunicacion() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_admin boolean:=calmavial_private.is_admin();
  v_owner uuid;
  v_deleted boolean;
  v_action text;
begin
  if v_uid is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  if tg_table_name='calmavial_sugerencias' then
    new.asunto:=btrim(new.asunto); new.mensaje:=btrim(new.mensaje);
    if tg_op='INSERT' then
      if new.usuario_id<>v_uid and not v_admin then raise exception 'No puedes escribir por otra cuenta.' using errcode='42501'; end if;
      new.creado_por:=v_uid; new.creado_en:=now(); new.eliminado:=false; new.moderado:=false;
      if not v_admin then new.estado:='abierta'; end if;
    else
      if old.usuario_id<>v_uid and not v_admin then raise exception 'Acceso denegado.' using errcode='42501'; end if;
      if new.id<>old.id or new.usuario_id<>old.usuario_id or new.creado_por<>old.creado_por or new.tipo<>old.tipo then
        raise exception 'No puedes reasignar una conversación.' using errcode='42501';
      end if;
      if not v_admin and new.estado<>old.estado then raise exception 'Solo administración cambia el estado.' using errcode='42501'; end if;
      new.creado_en:=old.creado_en;
      new.moderado:=old.moderado or (v_admin and old.creado_por<>v_uid and (new.mensaje<>old.mensaje or new.asunto<>old.asunto));
    end if;
    if new.evaluacion_id is not null and not exists(select 1 from public.evaluaciones e where e.id=new.evaluacion_id and e.usuario_id=new.usuario_id) then
      raise exception 'La evaluación no pertenece a esa cuenta.' using errcode='42501';
    end if;
  elsif tg_table_name='calmavial_respuestas' then
    select s.usuario_id,s.eliminado into v_owner,v_deleted from public.calmavial_sugerencias s where s.id=new.sugerencia_id;
    if v_owner is null or (v_owner<>v_uid and not v_admin) then raise exception 'Acceso denegado a la conversación.' using errcode='42501'; end if;
    new.mensaje:=btrim(new.mensaje);
    if tg_op='INSERT' then
      if v_deleted then raise exception 'Restaura la conversación antes de responder.' using errcode='23514'; end if;
      new.autor_id:=v_uid; new.creado_en:=now(); new.eliminado:=false; new.moderado:=false;
    else
      if old.autor_id<>v_uid and not v_admin then raise exception 'Solo puedes editar tus respuestas.' using errcode='42501'; end if;
      if new.id<>old.id or new.autor_id<>old.autor_id or new.sugerencia_id<>old.sugerencia_id then
        raise exception 'No puedes cambiar el autor de una respuesta.' using errcode='42501';
      end if;
      new.creado_en:=old.creado_en;
      new.moderado:=old.moderado or (v_admin and old.autor_id<>v_uid and new.mensaje<>old.mensaje);
    end if;
  else raise exception 'Recurso no permitido.' using errcode='42501';
  end if;
  -- Una respuesta también mueve la conversación al principio de la bandeja.
  if tg_table_name='calmavial_respuestas' then
    update public.calmavial_sugerencias set actualizado_en=now() where id=new.sugerencia_id;
  end if;
  new.actualizado_en:=now();
  v_action:=case when tg_op='INSERT' then 'CREAR' when not old.eliminado and new.eliminado then 'ARCHIVAR' when old.eliminado and not new.eliminado then 'RESTAURAR' else 'EDITAR' end;
  insert into public.calmavial_gestion_auditoria(actor_id,recurso,registro_id,accion,anterior)
  values(v_uid,tg_table_name,new.id,v_action,case when tg_op='UPDATE' then to_jsonb(old) else null end);
  return new;
end $$;
revoke all on function calmavial_private.controlar_comunicacion() from public,anon,authenticated;
create trigger calmavial_control_sugerencias before insert or update on public.calmavial_sugerencias
  for each row execute function calmavial_private.controlar_comunicacion();
create trigger calmavial_control_respuestas before insert or update on public.calmavial_respuestas
  for each row execute function calmavial_private.controlar_comunicacion();

create function calmavial_private.auditar_perfil_admin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and calmavial_private.is_admin() and to_jsonb(old) is distinct from to_jsonb(new) then
    insert into public.calmavial_gestion_auditoria(actor_id,recurso,registro_id,accion,anterior)
    values(auth.uid(),'perfiles',new.id,'EDITAR',to_jsonb(old));
  end if;
  return new;
end $$;
revoke all on function calmavial_private.auditar_perfil_admin() from public,anon,authenticated;
create trigger calmavial_audit_profile_admin after update on public.perfiles
  for each row execute function calmavial_private.auditar_perfil_admin();

create index calmavial_sugerencias_owner_idx on public.calmavial_sugerencias(usuario_id,actualizado_en desc);
create index calmavial_sugerencias_creator_idx on public.calmavial_sugerencias(creado_por);
create index calmavial_sugerencias_eval_idx on public.calmavial_sugerencias(evaluacion_id);
create index calmavial_sugerencias_status_idx on public.calmavial_sugerencias(eliminado,estado,actualizado_en desc);
create index calmavial_respuestas_thread_idx on public.calmavial_respuestas(sugerencia_id,creado_en);
create index calmavial_respuestas_author_idx on public.calmavial_respuestas(autor_id);
create index calmavial_gestion_actor_idx on public.calmavial_gestion_auditoria(actor_id,creado_en desc);
commit;
select 'GESTION_COMUNICACION_ROLES_CONFIGURADOS' as resultado;

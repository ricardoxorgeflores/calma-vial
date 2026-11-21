begin;
create or replace function calmavial_private.controlar_comunicacion() returns trigger
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
commit;
select 'ACTIVIDAD_CONVERSACIONES_ACTUALIZADA' as resultado;

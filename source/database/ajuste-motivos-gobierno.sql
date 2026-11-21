create or replace function public.calmavial_cambiar_usuario(p_usuario_id uuid,p_eliminar boolean,p_motivo text) returns boolean
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
create or replace function public.calmavial_publicar_preguntas(p_preguntas jsonb,p_motivo text,p_base bigint) returns public.calmavial_cuestionarios
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

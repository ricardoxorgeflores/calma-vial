-- Solo el guardado versionado de la web; conserva el contrato Android e historial.
begin;
create or replace function public.guardar_evaluacion_versionada(p_request_id uuid,p_respuestas integer[],p_momento text,p_vehiculo text,p_animo integer,p_version bigint)
returns setof public.evaluaciones language plpgsql security definer set search_path='' as $$
declare v_row public.evaluaciones; v_previous boolean; v_version bigint;
begin
 if not calmavial_private.cuenta_activa() then raise exception 'El acceso de esta cuenta fue retirado.' using errcode='42501'; end if;
 if not exists(select 1 from public.perfiles where id=auth.uid()) then raise exception 'Completa tu perfil.'; end if;
 if not exists(select 1 from public.calmavial_cuestionarios where id=p_version) then raise exception 'La versión del cuestionario no existe.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 v_previous:=exists(select 1 from calmavial_private.evaluation_requests where usuario_id=auth.uid() and request_id=p_request_id);
 if not v_previous and (p_vehiculo is null or p_vehiculo not in ('Particular','Transporte público','Transporte comercial')) then
  raise exception 'Selecciona un vehículo del alcance del estudio: particular, transporte público o comercial.' using errcode='22023';
 end if;
 select * into v_row from public.guardar_evaluacion(p_request_id,p_respuestas,p_momento,p_vehiculo,p_animo);
 select cuestionario_id into v_version from public.calmavial_evaluacion_version where evaluacion_id=v_row.id;
 if v_previous and v_version<>p_version then raise exception 'La solicitud ya fue guardada con otra versión.'; end if;
 if not v_previous then update public.calmavial_evaluacion_version set cuestionario_id=p_version where evaluacion_id=v_row.id; end if;
 return next v_row;
end $$;
revoke all on function public.guardar_evaluacion_versionada(uuid,integer[],text,text,integer,bigint) from public,anon;
grant execute on function public.guardar_evaluacion_versionada(uuid,integer[],text,text,integer,bigint) to authenticated;
commit;

-- Fixtures sintéticas y rollback: no cambia personas ni preguntas de producción.
begin;
select set_config('calma.v_user',gen_random_uuid()::text,true),set_config('calma.v_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
 (current_setting('calma.v_user')::uuid,'qa-gobierno-'||current_setting('calma.v_user')||'@example.invalid','authenticated','authenticated'),
 (current_setting('calma.v_admin')::uuid,'qa-gobierno-'||current_setting('calma.v_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,edad,correo) values
 (current_setting('calma.v_user')::uuid,'usuario','Usuario de prueba',25,'qa-gobierno@example.invalid'),
 (current_setting('calma.v_admin')::uuid,'admin','Administrador de prueba',30,'qa-gobierno@example.invalid');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; v_id bigint; begin
 if not public.calmavial_cuenta_activa() then raise exception 'FALLO cuenta nueva'; end if;
 blocked:=false; begin perform public.calmavial_publicar_preguntas((select preguntas from public.calmavial_cuestionarios where vigente),'Intento no autorizado',1); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO usuario publica'; end if;
 blocked:=false; begin perform public.calmavial_cambiar_usuario(auth.uid(),true,'Intento no autorizado'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO usuario elimina'; end if;
 blocked:=false; begin perform public.calmavial_diagnostico(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO usuario consulta diagnóstico'; end if;
 blocked:=false; begin update public.perfiles set apellido_materno='t' where id=auth.uid(); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO apellido inválido'; end if;
 blocked:=false; begin update public.perfiles set nombres='Persona 123' where id=auth.uid(); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO nombres inválidos'; end if;
 blocked:=false; begin update public.perfiles set documento='ABCD' where id=auth.uid(); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO documento inválido'; end if;
 select id into v_id from public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3);
 perform set_config('calma.v_legacy',v_id::text,true);
 if (select cuestionario_id from public.calmavial_evaluacion_version where evaluacion_id=v_id)<>1 then raise exception 'FALLO contrato Android'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v_base bigint; v_new bigint; q jsonb; blocked boolean; begin
 select id,preguntas into v_base,q from public.calmavial_cuestionarios where vigente;
 q:=jsonb_set(q,'{0}',to_jsonb((q->>0)||' Texto sintético de comprobación.'));
 select id into v_new from public.calmavial_publicar_preguntas(q,'Prueba transaccional del versionado',v_base);
 perform set_config('calma.v_version',v_new::text,true);
 if (select preguntas->>0 from public.calmavial_cuestionarios where id=1)=(q->>0) then raise exception 'FALLO historial modificado'; end if;
 if (select count(*) from public.calmavial_cuestionarios where vigente)<>1 then raise exception 'FALLO versiones vigentes'; end if;
 blocked:=false; begin perform public.calmavial_publicar_preguntas(q,'Conflicto de edición simultánea',v_base); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO edición concurrente'; end if;
 blocked:=false; begin perform public.calmavial_publicar_preguntas('["incorrecto"]','Prueba de formato incorrecto',v_new); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO formato preguntas'; end if;
 blocked:=false; begin update public.calmavial_cuestionarios set preguntas=q where id=1; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO actualización directa'; end if;
 blocked:=false; begin perform public.calmavial_cambiar_usuario(auth.uid(),true,'No se permite autoeliminación'); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO eliminación administrador'; end if;
 if not (public.calmavial_diagnostico() ? 'hashes_bcrypt') then raise exception 'FALLO diagnóstico'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v_id bigint; v_repeat bigint; v_request uuid:=gen_random_uuid(); blocked boolean; begin
 select id into v_id from public.guardar_evaluacion_versionada(v_request,array_fill(4,array[14]),'Después de conducir','Particular',3,current_setting('calma.v_version')::bigint);
 select id into v_repeat from public.guardar_evaluacion_versionada(v_request,array_fill(4,array[14]),'Después de conducir','Particular',3,current_setting('calma.v_version')::bigint);
 if v_id<>v_repeat then raise exception 'FALLO idempotencia'; end if;
 if (select cuestionario_id from public.calmavial_evaluacion_version where evaluacion_id=v_id)<>current_setting('calma.v_version')::bigint then raise exception 'FALLO versión web'; end if;
 if (select cuestionario_id from public.calmavial_evaluacion_version where evaluacion_id=current_setting('calma.v_legacy')::bigint)<>1 then raise exception 'FALLO historial Android'; end if;
 blocked:=false; begin perform public.guardar_evaluacion_versionada(v_request,array_fill(4,array[14]),'Después de conducir','Particular',3,1); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO cambiar versión de solicitud guardada'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.calmavial_cambiar_usuario(current_setting('calma.v_user')::uuid,true,'Retirada sintética de acceso para regresión');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; n integer; begin
 if public.calmavial_cuenta_activa() then raise exception 'FALLO acceso retirado'; end if;
 if exists(select 1 from public.perfiles) or exists(select 1 from public.evaluaciones) or exists(select 1 from public.diario) or exists(select 1 from public.calmavial_cuestionarios) or exists(select 1 from public.calmavial_sugerencias) then raise exception 'FALLO lecturas JWT anterior'; end if;
 blocked:=false; begin perform public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO escritura con acceso retirado'; end if;
 blocked:=false; begin perform public.calmavial_informe(auth.uid()); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO informe con acceso retirado'; end if;
 blocked:=false; begin perform public.calmavial_papelera(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO papelera con acceso retirado'; end if;
 update public.perfiles set nombres='No permitido' where id=auth.uid(); get diagnostics n=row_count;
 if n<>0 then raise exception 'FALLO edición con acceso retirado'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.calmavial_cambiar_usuario(current_setting('calma.v_user')::uuid,false,'Restauración sintética del usuario de prueba');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.v_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not public.calmavial_cuenta_activa() or (select count(*) from public.evaluaciones where usuario_id=auth.uid())<>2 then raise exception 'FALLO restauración'; end if;
end $$;
reset role;
set local role anon;
do $$ declare blocked boolean:=false; begin
 begin perform public.calmavial_diagnostico(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO diagnóstico anónimo'; end if;
end $$;
reset role;
rollback;
select 'VERSIONES_PERFILES_ELIMINACION_RESTAURACION_JWT_DIAGNOSTICO_OK' as resultado;

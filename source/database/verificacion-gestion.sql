-- Prueba de permisos con tres cuentas sintéticas. Nada de esta transacción se conserva.
begin;
select set_config('calma.g_one',gen_random_uuid()::text,true),set_config('calma.g_two',gen_random_uuid()::text,true),set_config('calma.g_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
  (current_setting('calma.g_one')::uuid,'qa-gestion-'||current_setting('calma.g_one')||'@example.invalid','authenticated','authenticated'),
  (current_setting('calma.g_two')::uuid,'qa-gestion-'||current_setting('calma.g_two')||'@example.invalid','authenticated','authenticated'),
  (current_setting('calma.g_admin')::uuid,'qa-gestion-'||current_setting('calma.g_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,correo,edad) values
  (current_setting('calma.g_one')::uuid,'usuario','Prueba gestión uno','qa-gestion@example.invalid',25),
  (current_setting('calma.g_two')::uuid,'usuario','Prueba gestión dos','qa-gestion@example.invalid',25),
  (current_setting('calma.g_admin')::uuid,'admin','Prueba gestión admin','qa-gestion@example.invalid',25);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.g_one'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v_id uuid; v_reply uuid; v_eval bigint; blocked boolean; n integer; begin
  select id into v_eval from public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3);
  insert into public.calmavial_sugerencias(usuario_id,creado_por,asunto,mensaje,evaluacion_id)
  values(auth.uid(),auth.uid(),'Consulta sintética','Mensaje sintético para comprobar seguridad.',v_eval) returning id into v_id;
  perform set_config('calma.g_thread',v_id::text,true);
  perform set_config('calma.g_eval',v_eval::text,true);
  insert into public.calmavial_respuestas(sugerencia_id,autor_id,mensaje) values(v_id,auth.uid(),'Respuesta sintética propia.') returning id into v_reply;
  perform set_config('calma.g_reply',v_reply::text,true);
  update public.calmavial_sugerencias set mensaje='Mi mensaje editado correctamente.' where id=v_id;
  blocked:=false;
  begin update public.calmavial_sugerencias set estado='resuelta' where id=v_id; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO usuario cambia estado administrativo'; end if;
  blocked:=false;
  begin update public.calmavial_sugerencias set usuario_id=current_setting('calma.g_two')::uuid where id=v_id; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO reasignación de conversación'; end if;
  blocked:=false;
  begin insert into public.calmavial_sugerencias(usuario_id,creado_por,asunto,mensaje) values(current_setting('calma.g_two')::uuid,auth.uid(),'No autorizado','Una cuenta no debe escribir por otra.'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO usuario escribe por otra cuenta'; end if;
  update public.calmavial_sugerencias set eliminado=true where id=v_id;
  blocked:=false;
  begin insert into public.calmavial_respuestas(sugerencia_id,autor_id,mensaje) values(v_id,auth.uid(),'Una conversación archivada no acepta nuevas respuestas.'); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'FALLO respuesta en conversación archivada'; end if;
  update public.calmavial_sugerencias set eliminado=false where id=v_id;
  select count(*) into n from public.calmavial_gestion_auditoria;
  if n<>0 then raise exception 'FALLO usuario lee auditoría'; end if;
  blocked:=false;
  begin delete from public.calmavial_sugerencias where id=v_id; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO borrado irreversible concedido al cliente'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.g_two'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; blocked boolean:=false; begin
  select count(*) into n from public.calmavial_sugerencias where id=current_setting('calma.g_thread')::uuid;
  if n<>0 then raise exception 'FALLO lectura de conversaciones ajenas'; end if;
  select count(*) into n from public.calmavial_respuestas where id=current_setting('calma.g_reply')::uuid;
  if n<>0 then raise exception 'FALLO lectura de respuestas ajenas'; end if;
  update public.calmavial_sugerencias set mensaje='Una edición no autorizada.' where id=current_setting('calma.g_thread')::uuid;
  get diagnostics n=row_count; if n<>0 then raise exception 'FALLO edición de mensaje ajeno'; end if;
  begin insert into public.calmavial_respuestas(sugerencia_id,autor_id,mensaje) values(current_setting('calma.g_thread')::uuid,auth.uid(),'Una respuesta ajena prohibida.'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO respuesta en conversación ajena'; end if;
  blocked:=false;
  begin insert into public.calmavial_sugerencias(usuario_id,creado_por,asunto,mensaje,evaluacion_id) values(auth.uid(),auth.uid(),'Evaluación no autorizada','No debe aceptar la evaluación de otra cuenta.',current_setting('calma.g_eval')::bigint); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO vincular evaluación ajena'; end if;
  update public.perfiles set nombres='No permitido' where id=current_setting('calma.g_one')::uuid;
  get diagnostics n=row_count; if n<>0 then raise exception 'FALLO edición de perfil ajeno'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.g_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; blocked boolean; r uuid; begin
  select count(*) into n from public.calmavial_sugerencias where id=current_setting('calma.g_thread')::uuid;
  if n<>1 then raise exception 'FALLO administrador no ve conversación'; end if;
  insert into public.calmavial_respuestas(sugerencia_id,autor_id,mensaje) values(current_setting('calma.g_thread')::uuid,auth.uid(),'Respuesta administrativa sintética.') returning id into r;
  update public.calmavial_respuestas set mensaje='Respuesta administrativa editada.' where id=r;
  update public.calmavial_respuestas set eliminado=true where id=r;
  update public.calmavial_respuestas set eliminado=false where id=r;
  update public.calmavial_sugerencias set mensaje='Contenido moderado por administración.',estado='en_revision' where id=current_setting('calma.g_thread')::uuid;
  select count(*) into n from public.calmavial_sugerencias where id=current_setting('calma.g_thread')::uuid and moderado and usuario_id=current_setting('calma.g_one')::uuid;
  if n<>1 then raise exception 'FALLO moderación no identificada'; end if;
  update public.calmavial_respuestas set mensaje='Respuesta del usuario moderada.' where id=current_setting('calma.g_reply')::uuid;
  select count(*) into n from public.calmavial_respuestas where id=current_setting('calma.g_reply')::uuid and moderado and autor_id=current_setting('calma.g_one')::uuid;
  if n<>1 then raise exception 'FALLO se pierde autoría de respuesta'; end if;
  update public.calmavial_sugerencias set estado='resuelta',eliminado=true where id=current_setting('calma.g_thread')::uuid;
  update public.calmavial_sugerencias set eliminado=false where id=current_setting('calma.g_thread')::uuid;
  update public.perfiles set nombres='Usuario editado por administración',telefono='+591 71234567' where id=current_setting('calma.g_one')::uuid;
  get diagnostics n=row_count; if n<>1 then raise exception 'FALLO administrador no edita perfil'; end if;
  blocked:=false;
  begin update public.perfiles set rol='admin' where id=current_setting('calma.g_one')::uuid; exception when others then blocked:=true; end;
  if not blocked then raise exception 'FALLO se permite cambiar rol desde el cliente'; end if;
  blocked:=false;
  begin update public.perfiles set correo='forjado@example.invalid' where id=current_setting('calma.g_one')::uuid; exception when others then blocked:=true; end;
  if not blocked then raise exception 'FALLO se permite falsificar correo'; end if;
  select count(*) into n from public.calmavial_gestion_auditoria where actor_id=auth.uid() and anterior is not null;
  if n<7 then raise exception 'FALLO auditoría administrativa incompleta: %',n; end if;
  blocked:=false;
  begin delete from public.calmavial_gestion_auditoria; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO administrador puede borrar auditoría'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ declare blocked boolean:=false; begin
  begin perform count(*) from public.calmavial_sugerencias; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO acceso anónimo'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('authenticated','calmavial_private.controlar_comunicacion()','execute') then raise exception 'FALLO función interna expuesta'; end if;
end $$;
rollback;
select 'GESTION_CRUD_ROLES_MODERACION_PERFILES_AUDITORIA_OK' as resultado;

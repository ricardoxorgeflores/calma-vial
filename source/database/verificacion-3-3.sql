-- Pruebas de bajas con identidades sintéticas y rollback.
begin;
select set_config('calma.qa33_user',gen_random_uuid()::text,true),set_config('calma.qa33_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
 (current_setting('calma.qa33_user')::uuid,'qa33-'||current_setting('calma.qa33_user')||'@example.invalid','authenticated','authenticated'),
 (current_setting('calma.qa33_admin')::uuid,'qa33-'||current_setting('calma.qa33_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,edad,correo) values
 (current_setting('calma.qa33_user')::uuid,'usuario','Usuario de prueba',25,'qa33@example.invalid'),
 (current_setting('calma.qa33_admin')::uuid,'admin','Administrador de prueba',30,'qa33@example.invalid');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; begin
 perform public.guardar_evaluacion_versionada(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3,(select id from public.calmavial_cuestionarios where vigente));
 blocked:=false; begin perform public.calmavial_baja_usuario(auth.uid(),false,'Intento sin privilegios','ELIMINAR'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO usuario elimina'; end if;
 blocked:=false; begin perform public.calmavial_usuarios_baja(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO usuario consulta bajas'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; begin
 blocked:=false; begin perform public.calmavial_baja_usuario(auth.uid(),false,'Intento de autobaja','ELIMINAR'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO autobaja'; end if;
 blocked:=false; begin perform public.calmavial_baja_usuario(current_setting('calma.qa33_user')::uuid,false,'Motivo de prueba','INCORRECTO'); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO confirmación'; end if;
 perform public.calmavial_baja_usuario(current_setting('calma.qa33_user')::uuid,false,'Baja sintética recuperable','ELIMINAR');
 if not exists(select 1 from jsonb_array_elements(public.calmavial_usuarios_baja()) r where r->>'usuario_id'=current_setting('calma.qa33_user')) then raise exception 'FALLO listado'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; begin
 if public.calmavial_cuenta_activa() then raise exception 'FALLO cuenta eliminada activa'; end if;
 if exists(select 1 from public.evaluaciones where usuario_id=auth.uid()) then raise exception 'FALLO lectura con JWT previo'; end if;
 blocked:=false; begin perform public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO escritura eliminada'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.calmavial_baja_usuario(current_setting('calma.qa33_user')::uuid,true,'Restauración sintética recuperable','RESTAURAR');
select public.calmavial_cambiar_usuario(current_setting('calma.qa33_user')::uuid,true,'Suspensión previa a baja sintética');
select public.calmavial_baja_usuario(current_setting('calma.qa33_user')::uuid,false,'Segunda baja de prueba','ELIMINAR');
select public.calmavial_baja_usuario(current_setting('calma.qa33_user')::uuid,true,'Restauración de prueba suspendida','RESTAURAR');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin if public.calmavial_cuenta_activa() then raise exception 'FALLO suspensión previa se perdió'; end if; end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.calmavial_cambiar_usuario(current_setting('calma.qa33_user')::uuid,false,'Reactivación sintética final');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa33_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not public.calmavial_cuenta_activa() then raise exception 'FALLO restauración'; end if;
 if (select count(*) from public.evaluaciones where usuario_id=auth.uid())<>1 then raise exception 'FALLO conservación'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.calmavial_gestion_auditoria where registro_id=current_setting('calma.qa33_user')::uuid and accion in ('eliminar_usuario','restaurar_usuario'))<>4 then raise exception 'FALLO auditoría'; end if;
end $$;
set local role anon;
do $$ declare blocked boolean; begin
 blocked:=false; begin perform public.calmavial_usuarios_baja(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO anónimo'; end if;
end $$;
reset role;
rollback;
select 'BAJA_RESTAURACION_ROLES_CONFIRMACION_JWT_AUDITORIA_OK' as resultado;

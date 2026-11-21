-- Fixtures sintéticas; nunca opera sobre cuentas reales. Todo se revierte.
begin;
select set_config('calma.qa_user',gen_random_uuid()::text,true),set_config('calma.qa_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
 (current_setting('calma.qa_user')::uuid,'qa-32-'||current_setting('calma.qa_user')||'@example.invalid','authenticated','authenticated'),
 (current_setting('calma.qa_admin')::uuid,'qa-32-'||current_setting('calma.qa_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,edad,correo) values
 (current_setting('calma.qa_user')::uuid,'usuario','Usuario de prueba',25,'qa@example.invalid'),
 (current_setting('calma.qa_admin')::uuid,'admin','Administrador de prueba',30,'qa@example.invalid');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v bigint; a public.evaluaciones; b public.evaluaciones; r uuid:=gen_random_uuid(); vehicle text; blocked boolean; begin
 select id into v from public.calmavial_cuestionarios where vigente;
 foreach vehicle in array array['Particular','Transporte público','Transporte comercial'] loop
  select * into a from public.guardar_evaluacion_versionada(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir',vehicle,3,v);
  if a.id is null or a.total<>42 then raise exception 'FALLO cálculo o guardado'; end if;
 end loop;
 select * into a from public.guardar_evaluacion_versionada(r,array_fill(3,array[14]),'Antes de conducir','Particular',3,v);
 select * into b from public.guardar_evaluacion_versionada(r,array_fill(3,array[14]),'Antes de conducir','Particular',3,v);
 if a.id<>b.id then raise exception 'FALLO idempotencia'; end if;
 foreach vehicle in array array['Motocicleta','Otro',null] loop
  blocked:=false; begin perform public.guardar_evaluacion_versionada(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir',vehicle,3,v); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'FALLO alcance'; end if;
 end loop;
 blocked:=false; begin perform public.calmavial_diagnostico(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO diagnóstico usuario'; end if;
 blocked:=false; begin perform public.calmavial_cambiar_usuario(auth.uid(),true,'Intento sin privilegios'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO suspensión usuario'; end if;
 -- El contrato previo del APK permanece disponible, separado de la web.
 perform public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Motocicleta',3);
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; begin
 blocked:=false; begin perform public.calmavial_cambiar_usuario(auth.uid(),true,'Intento de autosuspensión'); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'FALLO autosuspensión'; end if;
 perform public.calmavial_cambiar_usuario(current_setting('calma.qa_user')::uuid,true,'Suspensión sintética recuperable');
 if public.calmavial_diagnostico()->>'conexion'<>'ok' then raise exception 'FALLO diagnóstico admin'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; begin
 if public.calmavial_cuenta_activa() then raise exception 'FALLO suspensión'; end if;
 if exists(select 1 from public.evaluaciones where usuario_id=auth.uid()) then raise exception 'FALLO lectura con JWT anterior'; end if;
 blocked:=false; begin perform public.guardar_evaluacion_versionada(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3,1); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO escritura suspendida'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_admin'),'role','authenticated')::text,true);
set local role authenticated;
select public.calmavial_cambiar_usuario(current_setting('calma.qa_user')::uuid,false,'Reactivación sintética recuperable');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not public.calmavial_cuenta_activa() or not exists(select 1 from public.evaluaciones where usuario_id=auth.uid()) then raise exception 'FALLO reactivación'; end if;
end $$;
reset role;
rollback;
select 'ALCANCE_SUSPENSION_REACTIVACION_JWT_DIAGNOSTICO_OK' as resultado;

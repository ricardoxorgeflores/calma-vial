-- Prueba transaccional real. No conserva cuentas ni datos de demostración.
begin;
select set_config('calma.qa_one',gen_random_uuid()::text,true),set_config('calma.qa_two',gen_random_uuid()::text,true),set_config('calma.qa_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
(current_setting('calma.qa_one')::uuid,'qa19-'||current_setting('calma.qa_one')||'@example.invalid','authenticated','authenticated'),
(current_setting('calma.qa_two')::uuid,'qa19-'||current_setting('calma.qa_two')||'@example.invalid','authenticated','authenticated'),
(current_setting('calma.qa_admin')::uuid,'qa19-'||current_setting('calma.qa_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,correo,edad) values
(current_setting('calma.qa_one')::uuid,'usuario','Usuario prueba informe','qa19@example.invalid',25),
(current_setting('calma.qa_two')::uuid,'usuario','Usuario prueba ajena','qa19@example.invalid',25),
(current_setting('calma.qa_admin')::uuid,'admin','Administrador prueba','qa19@example.invalid',25);
select set_config('request.jwt.claim.sub',current_setting('calma.qa_one'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_one'),'role','authenticated','email','qa19@example.invalid')::text,true);
set local role authenticated;
do $$ declare row_id bigint; diary_id bigint; j jsonb; blocked boolean; n integer; begin
 for i in 1..2 loop
  select id into row_id from public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[14]),'Antes de conducir','Particular',3);
 end loop;
 blocked:=false; begin perform public.calmavial_informe(auth.uid()); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'FALLO: informe con menos de tres'; end if;
 select id into row_id from public.guardar_evaluacion(gen_random_uuid(),array_fill(4,array[14]),'Después de conducir','Particular',3);
 perform set_config('calma.eval_archivo',row_id::text,true);
 j:=public.calmavial_informe(auth.uid());
 if (j->>'total_evaluaciones')::integer<>3 or jsonb_array_length(j->'evaluaciones')<>3 or j->>'usuario_id'<>auth.uid()::text then raise exception 'FALLO: contrato informe'; end if;
 if j::text like '%encrypted_password%' or j::text like '%qa19@example.invalid%' then raise exception 'FALLO: campos privados innecesarios'; end if;
 perform public.calmavial_archivar('evaluaciones',row_id);
 select count(*) into n from public.evaluaciones where id=row_id;
 if n<>0 then raise exception 'FALLO: archivo visible para Android/web'; end if;
 if jsonb_array_length(public.calmavial_papelera())<>1 then raise exception 'FALLO: papelera propia'; end if;
 blocked:=false; begin perform public.calmavial_informe(auth.uid()); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'FALLO: archivados habilitan informe'; end if;
 perform public.calmavial_restaurar('evaluaciones',row_id);
 if not exists(select 1 from public.evaluaciones where id=row_id) then raise exception 'FALLO: restauración'; end if;
 j:=public.calmavial_informe(auth.uid());
 if (j->>'total_evaluaciones')::integer<>3 then raise exception 'FALLO: informe tras restauración'; end if;
 insert into public.diario(usuario_id,situacion,factor,intensidad) values(auth.uid(),'Diario sintético para probar papelera','Otra',2) returning id into diary_id;
 perform set_config('calma.diario_archivo',diary_id::text,true);
 perform public.calmavial_archivar('diario',diary_id);
 if exists(select 1 from public.diario where id=diary_id) then raise exception 'FALLO: diario archivado visible'; end if;
 perform public.calmavial_restaurar('diario',diary_id);
 update public.diario set nota='Restaurado y editable' where id=diary_id;
 if not exists(select 1 from public.diario where id=diary_id and nota='Restaurado y editable') then raise exception 'FALLO: diario restaurado'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('calma.qa_two'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_two'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare blocked boolean; begin
 blocked:=false; begin perform public.calmavial_informe(current_setting('calma.qa_one')::uuid); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO: informe ajeno'; end if;
 blocked:=false; begin perform public.calmavial_archivar('evaluaciones',current_setting('calma.eval_archivo')::bigint); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO: archivo ajeno'; end if;
 blocked:=false; begin perform public.calmavial_restaurar('diario',current_setting('calma.diario_archivo')::bigint); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO: restauración ajena'; end if;
 if public.calmavial_papelera()<>'[]'::jsonb then raise exception 'FALLO: papelera ajena'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('calma.qa_admin'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare j jsonb; blocked boolean:=false; begin
 j:=public.calmavial_informe(current_setting('calma.qa_one')::uuid);
 if jsonb_array_length(j->'evaluaciones')<>3 then raise exception 'FALLO: informe administrativo autorizado'; end if;
 if exists(select 1 from public.diario where id=current_setting('calma.diario_archivo')::bigint) then raise exception 'FALLO: administrador lee diario ajeno'; end if;
 begin perform public.calmavial_archivar('evaluaciones',current_setting('calma.eval_archivo')::bigint); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'FALLO: administrador altera evaluaciones ajenas'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('calma.qa_one'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_one'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; begin
 delete from public.evaluaciones where id=current_setting('calma.eval_archivo')::bigint;
 get diagnostics n=row_count; if n<>1 then raise exception 'FALLO: eliminación física propia'; end if;
 if exists(select 1 from public.evaluaciones where id=current_setting('calma.eval_archivo')::bigint) then raise exception 'FALLO: eliminación física conservó registro'; end if;
end $$;
reset role;
select 'ARCHIVO_RESTAURACION_PDF_ROLES_ANDROID_CONTRATO_OK' as resultado;
rollback;

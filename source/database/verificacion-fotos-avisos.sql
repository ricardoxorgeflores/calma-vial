-- Registros sintéticos, sin archivos ni datos personales. Todo se revierte.
begin;
select set_config('calma.qa_one',gen_random_uuid()::text,true),set_config('calma.qa_two',gen_random_uuid()::text,true),set_config('calma.qa_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
(current_setting('calma.qa_one')::uuid,'qa-foto-'||current_setting('calma.qa_one')||'@example.invalid','authenticated','authenticated'),
(current_setting('calma.qa_two')::uuid,'qa-foto-'||current_setting('calma.qa_two')||'@example.invalid','authenticated','authenticated'),
(current_setting('calma.qa_admin')::uuid,'qa-foto-'||current_setting('calma.qa_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,correo,edad) values
(current_setting('calma.qa_one')::uuid,'usuario','Prueba fotos uno','qa-foto@example.invalid',25),
(current_setting('calma.qa_two')::uuid,'usuario','Prueba fotos dos','qa-foto@example.invalid',25),
(current_setting('calma.qa_admin')::uuid,'admin','Prueba avisos admin','qa-foto@example.invalid',25);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v_id uuid; n integer; begin
  insert into public.calmavial_avisos(titulo,mensaje,creado_por) values('Aviso de prueba','Mensaje sintético de demostración.',auth.uid()) returning id into v_id;
  perform set_config('calma.aviso',v_id::text,true);
  update public.calmavial_avisos set mensaje='Mensaje editado correctamente.' where id=v_id;
  update public.calmavial_avisos set activo=false where id=v_id;
  select count(*) into n from public.calmavial_auditoria where aviso_id=v_id;
  if n<>3 then raise exception 'FALLO auditoría'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_one'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; blocked boolean:=false; begin
  update public.perfiles set telefono='+591 71234567' where id=auth.uid();
  begin update public.perfiles set telefono='abcdef' where id=auth.uid(); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'FALLO teléfono inválido aceptado'; end if;
  blocked:=false;
  select count(*) into n from public.calmavial_avisos where id=current_setting('calma.aviso')::uuid;
  if n<>0 then raise exception 'FALLO estudiante ve archivado'; end if;
  begin insert into public.calmavial_avisos(titulo,mensaje,creado_por) values('No autorizado','Un estudiante no debe publicar.',auth.uid()); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO estudiante publica'; end if;
  update public.calmavial_avisos set activo=true where id=current_setting('calma.aviso')::uuid;
  get diagnostics n=row_count; if n<>0 then raise exception 'FALLO estudiante modifica'; end if;
  select count(*) into n from public.calmavial_auditoria where aviso_id=current_setting('calma.aviso')::uuid;
  if n<>0 then raise exception 'FALLO estudiante ve auditoría'; end if;
  insert into storage.objects(bucket_id,name) values('calmavial-avatars',auth.uid()::text||'/profile.jpg');
  blocked:=false;
  begin insert into storage.objects(bucket_id,name) values('calmavial-avatars',current_setting('calma.qa_two')||'/profile.jpg'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FALLO foto ajena'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_two'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare n integer; begin
 select count(*) into n from storage.objects where bucket_id='calmavial-avatars' and name=current_setting('calma.qa_one')||'/profile.jpg';
 if n<>0 then raise exception 'FALLO lectura de foto ajena'; end if;
end $$;
reset role;
select 'FOTOS_AVISOS_ROLES_AUDITORIA_OK' as resultado;
rollback;

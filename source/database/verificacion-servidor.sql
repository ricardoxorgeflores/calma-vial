-- Pruebas en el esquema instalado. Todo se revierte; no conserva cuentas ni datos.
begin;

select set_config('calma.qa_one',gen_random_uuid()::text,true),set_config('calma.qa_two',gen_random_uuid()::text,true),set_config('calma.qa_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role) values
(current_setting('calma.qa_one')::uuid,'qa-calmavial-'||current_setting('calma.qa_one')||'@example.invalid','authenticated','authenticated'),
(current_setting('calma.qa_two')::uuid,'qa-calmavial-'||current_setting('calma.qa_two')||'@example.invalid','authenticated','authenticated'),
(current_setting('calma.qa_admin')::uuid,'qa-calmavial-'||current_setting('calma.qa_admin')||'@example.invalid','authenticated','authenticated');
insert into public.perfiles(id,rol,nombres,correo,edad) values
(current_setting('calma.qa_one')::uuid,'usuario','Prueba transaccional uno','qa-calmavial@example.invalid',25),
(current_setting('calma.qa_two')::uuid,'usuario','Prueba transaccional dos','qa-calmavial@example.invalid',25),
(current_setting('calma.qa_admin')::uuid,'admin','Prueba transaccional admin','qa-calmavial@example.invalid',25);
insert into public.diario(usuario_id,situacion,factor,intensidad) values(current_setting('calma.qa_two')::uuid,'Registro ajeno de prueba','Otra',2);
select set_config('request.jwt.claim.sub',current_setting('calma.qa_one'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_one'),'role','authenticated','email','qa-calmavial@example.invalid')::text,true);
set local role authenticated;
do $$ declare v_id bigint; v_repeat bigint; v_request uuid:=gen_random_uuid(); v_count integer; blocked boolean; begin
if public.es_admin() then raise exception 'FALLO: estudiante con acceso admin'; end if;
select count(*) into v_count from public.perfiles where id in (current_setting('calma.qa_one')::uuid,current_setting('calma.qa_two')::uuid,current_setting('calma.qa_admin')::uuid);
if v_count<>1 then raise exception 'FALLO: aislamiento de perfiles'; end if;
insert into public.diario(usuario_id,situacion,factor,intensidad) values(auth.uid(),'Diario prueba propia','Avance impedido',3) returning id into v_id;
update public.diario set nota='Editado correctamente' where id=v_id;
if not exists(select 1 from public.diario where id=v_id and nota='Editado correctamente') then raise exception 'FALLO: editar diario'; end if;
update public.diario set nota='No debe cambiar' where usuario_id=current_setting('calma.qa_two')::uuid;
get diagnostics v_count=ROW_COUNT; if v_count<>0 then raise exception 'FALLO: editar diario ajeno'; end if;
blocked:=false; begin insert into public.diario(usuario_id,situacion,factor,intensidad) values(current_setting('calma.qa_two')::uuid,'No autorizado','Otra',3); exception when insufficient_privilege then blocked:=true; end;
if not blocked then raise exception 'FALLO: insertar diario ajeno'; end if;
blocked:=false; begin update public.perfiles set rol='admin' where id=auth.uid(); exception when raise_exception then blocked:=true; end;
if not blocked then raise exception 'FALLO: escalada de rol'; end if;
select id into v_id from public.guardar_evaluacion(v_request,array_fill(3,array[14]),'Antes de conducir','Particular',3);
select id into v_repeat from public.guardar_evaluacion(v_request,array_fill(3,array[14]),'Antes de conducir','Particular',3);
if v_id<>v_repeat then raise exception 'FALLO: reintento duplicado'; end if;
if not exists(select 1 from public.evaluaciones where id=v_id and total=42 and prom_general=3 and prom_avance=3 and prom_temeraria=3 and prom_hostilidad=3 and nivel='Moderado') then raise exception 'FALLO: cálculo servidor'; end if;
select count(*) into v_count from public.evaluaciones where usuario_id=auth.uid(); if v_count<>1 then raise exception 'FALLO: idempotencia'; end if;
blocked:=false; begin perform public.guardar_evaluacion(gen_random_uuid(),array_fill(6,array[14]),'Antes de conducir','Particular',3); exception when raise_exception then blocked:=true; end;
if not blocked then raise exception 'FALLO: respuesta fuera de rango'; end if;
blocked:=false; begin perform public.guardar_evaluacion(gen_random_uuid(),array_fill(3,array[13]),'Antes de conducir','Particular',3); exception when raise_exception then blocked:=true; end;
if not blocked then raise exception 'FALLO: evaluación incompleta'; end if;
insert into public.evaluaciones(usuario_id,respuestas,total,prom_general,prom_avance,prom_temeraria,prom_hostilidad,nivel,momento,vehiculo,animo) values(auth.uid(),array_fill(5,array[14]),14,1,1,1,1,'Bajo','En otro momento','Transporte comercial',null) returning id into v_id;
if not exists(select 1 from public.evaluaciones where id=v_id and total=70 and nivel='Elevado') then raise exception 'FALLO: contrato Android y recálculo'; end if;
delete from public.evaluaciones where id=v_id; get diagnostics v_count=ROW_COUNT; if v_count<>1 then raise exception 'FALLO: borrar evaluación propia'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('calma.qa_admin'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('calma.qa_admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare v_count integer; begin
if not public.es_admin() then raise exception 'FALLO: rol administrador'; end if;
select count(*) into v_count from public.perfiles where id in (current_setting('calma.qa_one')::uuid,current_setting('calma.qa_two')::uuid,current_setting('calma.qa_admin')::uuid);
if v_count<>3 then raise exception 'FALLO: lectura administrativa'; end if;
select count(*) into v_count from public.evaluaciones where usuario_id=current_setting('calma.qa_one')::uuid;
if v_count<>1 then raise exception 'FALLO: evaluaciones administrativas'; end if;
select count(*) into v_count from public.diario where usuario_id=current_setting('calma.qa_two')::uuid;
if v_count<>0 then raise exception 'FALLO: privacidad del diario'; end if;
end $$;
reset role;
do $$ begin
if has_table_privilege('anon','public.perfiles','TRUNCATE') or has_table_privilege('authenticated','public.evaluaciones','TRUNCATE') then raise exception 'FALLO: privilegio TRUNCATE'; end if;
end $$;
select 'RLS_CALCULO_DIARIO_ROLES_IDEMPOTENCIA_OK' resultado;
rollback;

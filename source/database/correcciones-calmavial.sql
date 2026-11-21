-- CALMA VIAL: correcciones aplicadas y verificadas el 17 de noviembre de 2026.
-- Proyecto: wezudavlgzyevhlchuww. Esquema contrastado antes de ejecutar desde SQL Editor.
-- Conserva las cuentas y el contrato Android: roles usuario/admin; no cambia registros históricos.
begin;

-- Fallar si hay políticas desconocidas: una política permisiva adicional podría ampliar el acceso.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('perfiles','evaluaciones','diario')
    and policyname not in (
      'perfil_propio_o_admin_lee','perfil_crea_propio','perfil_edita_propio',
      'eval_lee','eval_crea','eval_elimina',
      'diario_lee','diario_crea','diario_edita','diario_elimina'
    )
  ) then raise exception 'Hay políticas adicionales: inspeccionarlas antes de aplicar esta propuesta.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='evaluaciones' and column_name='animo' and data_type='integer') then
    raise exception 'El contrato de evaluaciones no coincide con el esquema de referencia.';
  end if;
end $$;

create schema if not exists calmavial_private;
revoke all on schema calmavial_private from public, anon;
grant usage on schema calmavial_private to authenticated;

-- Consulta acotada para evitar recursión RLS. Esquema fuera de los esquemas expuestos de la API.
create or replace function calmavial_private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'admin'
  );
$$;
revoke all on function calmavial_private.is_admin() from public, anon;
grant execute on function calmavial_private.is_admin() to authenticated;

create or replace function public.es_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select calmavial_private.is_admin();
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- El código institucional compartido deja de otorgar privilegios administrativos.
-- Administradores existentes se conservan; nuevas asignaciones requieren al propietario en el servidor.
create or replace function public.controlar_rol()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    if tg_op='INSERT' then
      if new.id is distinct from auth.uid() or new.rol <> 'usuario' then
        raise exception 'Solo puedes crear tu propio perfil de estudiante.';
      end if;
      new.codigo_institucion := null;
      new.correo := auth.jwt()->>'email';
    elsif new.id is distinct from old.id
       or new.rol is distinct from old.rol
       or new.codigo_institucion is distinct from old.codigo_institucion
       or new.correo is distinct from old.correo then
      raise exception 'No puedes modificar identidad ni permisos desde el perfil.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists perfiles_controlar_rol on public.perfiles;
create trigger perfiles_controlar_rol before insert or update on public.perfiles
for each row execute function public.controlar_rol();

create or replace function calmavial_private.validate_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.nombres := btrim(new.nombres);
  if new.nombres is null or length(new.nombres) not between 1 and 100
     or length(new.apellido_paterno)>100 or length(new.apellido_materno)>100
     or length(new.usuario)>50 or length(new.documento)>30
     or length(new.telefono)>30 or length(new.direccion)>250
     or (new.edad is not null and new.edad not between 18 and 99) then
    raise exception 'Revisa nombres, edad y longitud de los datos del perfil.';
  end if;
  return new;
end;
$$;
revoke all on function calmavial_private.validate_profile() from public, anon, authenticated;
drop trigger if exists calmavial_validate_profile on public.perfiles;
create trigger calmavial_validate_profile before insert or update on public.perfiles
for each row execute function calmavial_private.validate_profile();

create or replace function calmavial_private.validate_evaluation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_mean numeric;
begin
  if new.respuestas is null or cardinality(new.respuestas) <> 14
     or array_ndims(new.respuestas) <> 1 or array_lower(new.respuestas,1) <> 1
     or exists (select 1 from unnest(new.respuestas) v where v is null or v < 1 or v > 5) then
    raise exception 'Se requieren exactamente 14 respuestas enteras entre 1 y 5.';
  end if;
  if new.animo is not null and (new.animo < 1 or new.animo > 5) then
    raise exception 'El estado de ánimo debe estar entre 1 y 5.';
  end if;
  if new.momento not in ('Antes de conducir','Después de conducir','En otro momento')
     or new.vehiculo not in ('Particular','Transporte público','Transporte comercial','Motocicleta','Auto particular','Camión','Otro') then
    raise exception 'Contexto de evaluación inválido.';
  end if;
  select sum(v) into new.total from unnest(new.respuestas) v;
  v_mean := new.total / 14.0;
  new.prom_general := round(v_mean,2);
  select round(avg(new.respuestas[i]),2) into new.prom_avance from unnest(array[2,5,7,8,11,12,14]) i;
  select round(avg(new.respuestas[i]),2) into new.prom_temeraria from unnest(array[1,3,4,6,13]) i;
  select round(avg(new.respuestas[i]),2) into new.prom_hostilidad from unnest(array[9,10]) i;
  new.nivel := case when v_mean < 2.34 then 'Bajo' when v_mean < 3.67 then 'Moderado' else 'Elevado' end;
  return new;
end;
$$;
revoke all on function calmavial_private.validate_evaluation() from public, anon, authenticated;
drop trigger if exists calmavial_validate_evaluation on public.evaluaciones;
create trigger calmavial_validate_evaluation before insert on public.evaluaciones
for each row execute function calmavial_private.validate_evaluation();

create or replace function calmavial_private.validate_diary()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.situacion := btrim(new.situacion);
  if new.situacion is null or length(new.situacion) not between 1 and 2000
     or length(coalesce(new.reaccion,'')) > 2000 or length(coalesce(new.nota,'')) > 2000
     or new.factor not in ('AVANCE','TEMERARIA','HOSTILIDAD','OTRA','Avance impedido','Conducción temeraria','Hostilidad directa','Otra')
     or new.intensidad not between 1 and 5 then
    raise exception 'Revisa situación, factor, intensidad y longitud de los textos.';
  end if;
  return new;
end;
$$;
revoke all on function calmavial_private.validate_diary() from public, anon, authenticated;
drop trigger if exists calmavial_validate_diary on public.diario;
create trigger calmavial_validate_diary before insert or update on public.diario
for each row execute function calmavial_private.validate_diary();

alter table public.perfiles enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.diario enable row level security;
revoke all on public.perfiles, public.evaluaciones, public.diario from anon, authenticated;
grant select,insert,update on public.perfiles to authenticated;
grant select,insert,delete on public.evaluaciones to authenticated;
grant select,insert,update,delete on public.diario to authenticated;

drop policy if exists perfil_propio_o_admin_lee on public.perfiles;
create policy perfil_propio_o_admin_lee on public.perfiles for select to authenticated
using (id=(select auth.uid()) or (select public.es_admin()));
drop policy if exists perfil_crea_propio on public.perfiles;
create policy perfil_crea_propio on public.perfiles for insert to authenticated
with check (id=(select auth.uid()) and rol='usuario');
drop policy if exists perfil_edita_propio on public.perfiles;
create policy perfil_edita_propio on public.perfiles for update to authenticated
using (id=(select auth.uid())) with check (id=(select auth.uid()));

drop policy if exists eval_lee on public.evaluaciones;
create policy eval_lee on public.evaluaciones for select to authenticated
using (usuario_id=(select auth.uid()) or (select public.es_admin()));
drop policy if exists eval_crea on public.evaluaciones;
create policy eval_crea on public.evaluaciones for insert to authenticated
with check (usuario_id=(select auth.uid()));
drop policy if exists eval_elimina on public.evaluaciones;
create policy eval_elimina on public.evaluaciones for delete to authenticated
using (usuario_id=(select auth.uid()));

drop policy if exists diario_lee on public.diario;
create policy diario_lee on public.diario for select to authenticated
using (usuario_id=(select auth.uid()));
drop policy if exists diario_crea on public.diario;
create policy diario_crea on public.diario for insert to authenticated
with check (usuario_id=(select auth.uid()));
drop policy if exists diario_edita on public.diario;
create policy diario_edita on public.diario for update to authenticated
using (usuario_id=(select auth.uid())) with check (usuario_id=(select auth.uid()));
drop policy if exists diario_elimina on public.diario;
create policy diario_elimina on public.diario for delete to authenticated
using (usuario_id=(select auth.uid()));

-- Guardados idempotentes sin añadir columnas al contrato de tablas que decodifica Android.
create table if not exists calmavial_private.evaluation_requests (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  evaluacion_id bigint not null references public.evaluaciones(id) on delete cascade,
  primary key (usuario_id, request_id)
);
create index if not exists calmavial_requests_evaluacion_idx
on calmavial_private.evaluation_requests(evaluacion_id);
alter table calmavial_private.evaluation_requests enable row level security;
revoke all on calmavial_private.evaluation_requests from public, anon, authenticated;
grant select,insert on calmavial_private.evaluation_requests to authenticated;
drop policy if exists solicitudes_propias_lee on calmavial_private.evaluation_requests;
create policy solicitudes_propias_lee on calmavial_private.evaluation_requests
for select to authenticated using (usuario_id=(select auth.uid()));
drop policy if exists solicitudes_propias_crea on calmavial_private.evaluation_requests;
create policy solicitudes_propias_crea on calmavial_private.evaluation_requests
for insert to authenticated with check (usuario_id=(select auth.uid()));

create or replace function public.guardar_evaluacion(
  p_request_id uuid, p_respuestas integer[], p_momento text, p_vehiculo text, p_animo integer
)
returns setof public.evaluaciones language plpgsql security invoker set search_path = '' as $$
declare v_id bigint; v_existing public.evaluaciones;
begin
  if auth.uid() is null or p_request_id is null then
    raise exception 'Se requiere una sesión válida y un identificador de solicitud.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text,0));
  select evaluacion_id into v_id from calmavial_private.evaluation_requests
  where usuario_id=auth.uid() and request_id=p_request_id;
  if found then
    select * into v_existing from public.evaluaciones where id=v_id and usuario_id=auth.uid();
    if v_existing.respuestas is distinct from p_respuestas
       or v_existing.momento is distinct from p_momento
       or v_existing.vehiculo is distinct from p_vehiculo
       or v_existing.animo is distinct from p_animo then
      raise exception 'Esta solicitud ya fue guardada con otras respuestas. Inicia una nueva evaluación.';
    end if;
  else
    insert into public.evaluaciones(usuario_id,respuestas,total,prom_general,prom_avance,prom_temeraria,prom_hostilidad,nivel,momento,vehiculo,animo)
    values(auth.uid(),p_respuestas,14,1,1,1,1,'Bajo',p_momento,p_vehiculo,p_animo)
    returning id into v_id;
    insert into calmavial_private.evaluation_requests(usuario_id,request_id,evaluacion_id)
    values(auth.uid(),p_request_id,v_id);
  end if;
  return query select * from public.evaluaciones where id=v_id and usuario_id=auth.uid();
end;
$$;
revoke all on function public.guardar_evaluacion(uuid,integer[],text,text,integer) from public, anon;
grant execute on function public.guardar_evaluacion(uuid,integer[],text,text,integer) to authenticated;

-- Activar únicamente las tablas que existen; las políticas RLS siguen controlando cada lectura.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['perfiles','evaluaciones','diario'] loop
      if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
commit;

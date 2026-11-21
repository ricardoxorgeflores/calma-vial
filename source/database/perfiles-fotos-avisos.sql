-- Ampliación aditiva: conserva intacto el contrato de las tablas utilizadas por Android.
begin;
create function calmavial_private.validate_contact() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.telefono:=btrim(new.telefono);
  if coalesce(new.telefono,'')<>'' and (
    new.telefono !~ '^[+0-9()[:space:]-]{6,30}$' or
    regexp_replace(new.telefono,'[^0-9]','','g') !~ '^[0-9]{6,15}$'
  ) then raise exception 'Escribe un teléfono válido o deja el campo vacío.' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function calmavial_private.validate_contact() from public,anon,authenticated;
create trigger calmavial_validate_contact before insert or update of telefono on public.perfiles
for each row execute function calmavial_private.validate_contact();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('calmavial-avatars','calmavial-avatars',false,524288,array['image/jpeg'])
on conflict (id) do nothing;

-- Cada cuenta dispone de un único objeto privado. No hay lectura administrativa ni anónima.
create policy calmavial_avatar_read on storage.objects for select to authenticated
using (bucket_id='calmavial-avatars' and name=(select auth.uid())::text || '/profile.jpg');
create policy calmavial_avatar_insert on storage.objects for insert to authenticated
with check (bucket_id='calmavial-avatars' and name=(select auth.uid())::text || '/profile.jpg');
create policy calmavial_avatar_update on storage.objects for update to authenticated
using (bucket_id='calmavial-avatars' and name=(select auth.uid())::text || '/profile.jpg')
with check (bucket_id='calmavial-avatars' and name=(select auth.uid())::text || '/profile.jpg');
create policy calmavial_avatar_delete on storage.objects for delete to authenticated
using (bucket_id='calmavial-avatars' and name=(select auth.uid())::text || '/profile.jpg');

create table public.calmavial_avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 5 and 100),
  mensaje text not null check (length(btrim(mensaje)) between 10 and 2000),
  activo boolean not null default true,
  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.calmavial_avisos enable row level security;
revoke all on public.calmavial_avisos from public,anon,authenticated;
grant select,insert,update on public.calmavial_avisos to authenticated;
create policy calmavial_avisos_read on public.calmavial_avisos for select to authenticated
using (activo or (select public.es_admin()));
create policy calmavial_avisos_create on public.calmavial_avisos for insert to authenticated
with check ((select public.es_admin()) and creado_por=(select auth.uid()));
create policy calmavial_avisos_update on public.calmavial_avisos for update to authenticated
using ((select public.es_admin())) with check ((select public.es_admin()));

create table public.calmavial_auditoria (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  aviso_id uuid not null,
  accion text not null check (accion in ('PUBLICAR','EDITAR','ARCHIVAR','REACTIVAR')),
  creado_en timestamptz not null default now()
);
alter table public.calmavial_auditoria enable row level security;
revoke all on public.calmavial_auditoria from public,anon,authenticated;
grant select on public.calmavial_auditoria to authenticated;
create policy calmavial_audit_admin on public.calmavial_auditoria for select to authenticated
using ((select public.es_admin()));

create function calmavial_private.audit_aviso() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not calmavial_private.is_admin() then
    raise exception 'Solo un administrador puede gestionar avisos.' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    new.creado_por:=auth.uid(); new.creado_en:=now();
  else
    new.id:=old.id; new.creado_por:=old.creado_por; new.creado_en:=old.creado_en;
  end if;
  new.titulo:=btrim(new.titulo); new.mensaje:=btrim(new.mensaje);
  new.actualizado_en:=now();
  insert into public.calmavial_auditoria(actor_id,aviso_id,accion)
  values(auth.uid(),new.id,case when tg_op='INSERT' then 'PUBLICAR'
    when old.activo and not new.activo then 'ARCHIVAR'
    when not old.activo and new.activo then 'REACTIVAR' else 'EDITAR' end);
  return new;
end $$;
revoke all on function calmavial_private.audit_aviso() from public,anon,authenticated;
create trigger calmavial_audit_aviso before insert or update on public.calmavial_avisos
for each row execute function calmavial_private.audit_aviso();
create index calmavial_avisos_author_idx on public.calmavial_avisos(creado_por);
create index calmavial_avisos_order_idx on public.calmavial_avisos(activo,creado_en desc,id desc);
create index calmavial_audit_order_idx on public.calmavial_auditoria(creado_en desc,id desc);
commit;

select 'FOTOS_PRIVADAS_AVISOS_AUDITORIA_CONFIGURADOS' as resultado;

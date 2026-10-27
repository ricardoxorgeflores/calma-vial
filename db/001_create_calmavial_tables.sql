-- Calma Vial: incidentes de tensión al conducir
create table if not exists public.calmavial_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  intensity smallint not null check (intensity between 1 and 5),
  trigger_note text,
  did_breathing_exercise boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists calmavial_incidents_user_id_idx on public.calmavial_incidents(user_id);
create index if not exists calmavial_incidents_occurred_at_idx on public.calmavial_incidents(occurred_at);

alter table public.calmavial_incidents enable row level security;

create policy "calmavial_incidents_select_own" on public.calmavial_incidents
  for select using (auth.uid() = user_id);
create policy "calmavial_incidents_insert_own" on public.calmavial_incidents
  for insert with check (auth.uid() = user_id);
create policy "calmavial_incidents_update_own" on public.calmavial_incidents
  for update using (auth.uid() = user_id);
create policy "calmavial_incidents_delete_own" on public.calmavial_incidents
  for delete using (auth.uid() = user_id);

-- Catálogo de ejercicios de respiración
create table if not exists public.calmavial_exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_seconds int not null default 60,
  created_at timestamptz not null default now()
);

alter table public.calmavial_exercises enable row level security;
create policy "calmavial_exercises_select_all" on public.calmavial_exercises
  for select using (true);

-- Registro de ejercicios completados por el usuario
create table if not exists public.calmavial_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.calmavial_exercises(id) on delete cascade,
  incident_id uuid references public.calmavial_incidents(id) on delete set null,
  completed_at timestamptz not null default now()
);

create index if not exists calmavial_exercise_logs_user_id_idx on public.calmavial_exercise_logs(user_id);

alter table public.calmavial_exercise_logs enable row level security;
create policy "calmavial_exercise_logs_select_own" on public.calmavial_exercise_logs
  for select using (auth.uid() = user_id);
create policy "calmavial_exercise_logs_insert_own" on public.calmavial_exercise_logs
  for insert with check (auth.uid() = user_id);

-- Ejercicios iniciales
insert into public.calmavial_exercises (name, description, duration_seconds)
values
  ('Respiración 4-4-4', 'Inhala 4 segundos, sostén 4 segundos, exhala 4 segundos. Repite 4 veces.', 60),
  ('Respiración 4-7-8', 'Inhala 4 segundos, sostén 7 segundos, exhala 8 segundos. Repite 3 veces.', 90),
  ('Pausa de 1 minuto', 'Detente, suelta el volante si es seguro, cierra los ojos y respira lento 1 minuto.', 60)
on conflict do nothing;

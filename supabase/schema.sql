-- Esquema de Control de clases para Supabase (PostgreSQL).
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Es seguro ejecutarlo más de una vez.

create table if not exists public.clases (
  user_id         uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id              text        not null,
  fecha           date        not null,
  inicio          text        not null,
  fin             text        not null,
  categoria       text        not null,
  modulo          integer     not null check (modulo between 1 and 99),
  estado          text        not null default 'PENDIENTE'
                              check (estado in ('PENDIENTE', 'REALIZADA', 'CANCELADA', 'REPROGRAMADA')),
  fecha_realizada timestamptz,
  marca_verde     boolean     not null default false,
  revisar         boolean     not null default false,
  nota            text        not null default '',
  reprogramada_de text,
  reprogramada_a  text,
  cubierta_por    text,
  actualizada     timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.festivos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha   date not null,
  nombre  text not null default 'Festivo',
  primary key (user_id, fecha)
);

create index if not exists clases_user_fecha_idx on public.clases (user_id, fecha, inicio);

-- Seguridad: cada usuario solo ve y modifica sus propias filas.
alter table public.clases   enable row level security;
alter table public.festivos enable row level security;

drop policy if exists "clases: solo el dueño"   on public.clases;
drop policy if exists "festivos: solo el dueño" on public.festivos;

create policy "clases: solo el dueño" on public.clases
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "festivos: solo el dueño" on public.festivos
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Marca de tiempo automática al modificar una clase.
create or replace function public.tocar_actualizada() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizada := now();
  return new;
end $$;

drop trigger if exists clases_actualizada on public.clases;
create trigger clases_actualizada before update on public.clases
  for each row execute function public.tocar_actualizada();

-- Permisos de la API para usuarios con sesión iniciada (la clave anónima sin sesión no accede a nada).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clases, public.festivos to authenticated;

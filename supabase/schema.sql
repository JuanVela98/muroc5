-- Tablas del Muro de Ideas
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author text not null,
  content text not null check (char_length(content) between 1 and 280),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (idea_id, user_id)
);

alter table public.ideas enable row level security;
alter table public.likes enable row level security;

drop policy if exists "ideas: ver con sesion" on public.ideas;
drop policy if exists "ideas: crear propias" on public.ideas;
drop policy if exists "ideas: borrar propias" on public.ideas;
create policy "ideas: ver con sesion" on public.ideas for select to authenticated using (true);
create policy "ideas: crear propias" on public.ideas for insert to authenticated with check (user_id = auth.uid());
create policy "ideas: borrar propias" on public.ideas for delete to authenticated using (user_id = auth.uid());

drop policy if exists "likes: ver con sesion" on public.likes;
drop policy if exists "likes: dar propio" on public.likes;
drop policy if exists "likes: quitar propio" on public.likes;
create policy "likes: ver con sesion" on public.likes for select to authenticated using (true);
create policy "likes: dar propio" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes: quitar propio" on public.likes for delete to authenticated using (user_id = auth.uid());

-- Tiempo real
alter table public.likes replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.ideas;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.likes;
exception when duplicate_object then null; end $$;

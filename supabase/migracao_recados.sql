-- Portal CICM: mural de recados. Preserva todos os arquivos e dados existentes.
-- Execute no SQL Editor do mesmo projeto Supabase usado pelo Portal CICM.
create extension if not exists pgcrypto;
create table if not exists public.cicm_portal_recados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 180),
  conteudo text not null check (char_length(btrim(conteudo)) between 1 and 5000),
  autor text not null check (char_length(btrim(autor)) between 1 and 120),
  importante boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists cicm_recados_ordem_idx on public.cicm_portal_recados (importante desc, criado_em desc);
alter table public.cicm_portal_recados enable row level security;
revoke all on public.cicm_portal_recados from anon, authenticated;
grant select on public.cicm_portal_recados to anon, authenticated;
drop policy if exists cicm_recados_leitura_publica on public.cicm_portal_recados;
create policy cicm_recados_leitura_publica on public.cicm_portal_recados
  for select to anon, authenticated using (true);
-- INSERT/UPDATE/DELETE: somente a Edge Function area-instrutor com service_role
-- e o código secreto de instrutor validado no servidor.

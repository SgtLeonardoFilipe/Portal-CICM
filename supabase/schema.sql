-- PORTAL CICM SIMPLES — Execute no SQL Editor do Supabase.
-- Novas tabelas e bucket: NÃO apaga as estruturas anteriores.
-- Importante: todos os documentos serão públicos; use APENAS material de treinamento.

create extension if not exists pgcrypto;

create table if not exists public.cicm_portal_pedidos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  equipe text not null check (char_length(btrim(equipe)) between 1 and 100),
  categoria text not null check (categoria in ('Dados cadastrais','Pedidos ao Judiciário','Relatórios','Outros documentos')),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 180),
  arquivo_path text not null unique check (arquivo_path ~ '^pedidos/[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png)$'),
  arquivo_nome text not null check (char_length(arquivo_nome) between 1 and 255),
  criado_em timestamptz not null default now()
);

create table if not exists public.cicm_portal_respostas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.cicm_portal_pedidos(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  arquivo_path text not null unique check (arquivo_path ~ '^respostas/[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png)$'),
  arquivo_nome text not null check (char_length(arquivo_nome) between 1 and 255),
  criado_em timestamptz not null default now()
);
create index if not exists cicm_portal_respostas_pedido_idx on public.cicm_portal_respostas(pedido_id);

alter table public.cicm_portal_pedidos enable row level security;
alter table public.cicm_portal_respostas enable row level security;

-- Sem login: leitura e inclusão para visitantes; sem atualização ou exclusão.
revoke all on public.cicm_portal_pedidos from anon, authenticated;
revoke all on public.cicm_portal_respostas from anon, authenticated;
grant select, insert on public.cicm_portal_pedidos to anon, authenticated;
grant select, insert on public.cicm_portal_respostas to anon, authenticated;

drop policy if exists "cicm_pedidos_leitura_publica" on public.cicm_portal_pedidos;
create policy "cicm_pedidos_leitura_publica" on public.cicm_portal_pedidos for select to anon, authenticated using (true);
drop policy if exists "cicm_pedidos_insercao_publica" on public.cicm_portal_pedidos;
create policy "cicm_pedidos_insercao_publica" on public.cicm_portal_pedidos for insert to anon, authenticated with check (true);
drop policy if exists "cicm_respostas_leitura_publica" on public.cicm_portal_respostas;
create policy "cicm_respostas_leitura_publica" on public.cicm_portal_respostas for select to anon, authenticated using (true);
drop policy if exists "cicm_respostas_insercao_publica" on public.cicm_portal_respostas;
create policy "cicm_respostas_insercao_publica" on public.cicm_portal_respostas for insert to anon, authenticated with check (true);

-- Bucket público permite downloads de arquivos sem assinatura.
-- Limite e tipos definidos no servidor (não somente na interface).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cicm_publico', 'cicm_publico', true, 15728640,
 array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'text/plain','image/jpeg','image/png','application/octet-stream']::text[])
on conflict (id) do update set public=true, file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

-- Evita overwrite/remoção pelo cliente. Somente novos arquivos em pastas esperadas.
drop policy if exists "cicm_upload_publico" on storage.objects;
create policy "cicm_upload_publico" on storage.objects for insert to anon, authenticated
with check (
  bucket_id='cicm_publico'
  and name ~ '^(pedidos|respostas)/[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png)$'
);
-- A leitura do bucket público é liberada por sua configuração public=true.
-- Não criar políticas UPDATE ou DELETE para usuários anônimos.

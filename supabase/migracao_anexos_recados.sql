-- Executar no SQL Editor do projeto CICM (ighfivcwykpyqfluifnf).
-- Não remove arquivos nem recados existentes.
create table if not exists public.cicm_portal_recados_anexos (
  id uuid primary key default gen_random_uuid(),
  recado_id uuid not null references public.cicm_portal_recados(id) on delete cascade,
  arquivo_nome text not null check (char_length(arquivo_nome) between 1 and 255),
  arquivo_path text not null unique,
  arquivo_tamanho bigint not null check (arquivo_tamanho > 0 and arquivo_tamanho <= 15728640),
  criado_em timestamptz not null default now()
);
create index if not exists cicm_recados_anexos_recado_idx on public.cicm_portal_recados_anexos(recado_id);
alter table public.cicm_portal_recados_anexos enable row level security;
revoke all on public.cicm_portal_recados_anexos from anon, authenticated;
grant select on public.cicm_portal_recados_anexos to anon, authenticated;
drop policy if exists cicm_anexos_leitura on public.cicm_portal_recados_anexos;
create policy cicm_anexos_leitura on public.cicm_portal_recados_anexos
  for select to anon, authenticated using (true);
-- Bucket privado: os alunos só obtêm links assinados, não URLs permanentes.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('cicm_recados_privado','cicm_recados_privado',false,15728640,null)
on conflict (id) do update set public=false,file_size_limit=15728640;
-- Upload, edição e exclusão exclusivamente na Edge Function autenticada por código.

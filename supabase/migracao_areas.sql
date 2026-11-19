-- MIGRAÇÃO da versão simples para duas áreas. NÃO apaga pedidos nem respostas existentes.
-- Execute depois de fazer um backup do banco. Execute APENAS UMA VEZ ou reexecute se necessário.
-- Respostas antigas permanecem publicadas; novas respostas são rascunhos no bucket privado.

alter table public.cicm_portal_respostas
  add column if not exists publicada boolean not null default true;

create index if not exists cicm_respostas_publicadas_idx
  on public.cicm_portal_respostas(pedido_id, publicada);

-- Deixar somente as respostas publicadas visíveis para visitantes, incluindo chamadas diretas à API.
drop policy if exists "cicm_respostas_leitura_publica" on public.cicm_portal_respostas;
create policy "cicm_respostas_leitura_publica" on public.cicm_portal_respostas
  for select to anon, authenticated using (publicada = true);

-- CRÍTICO: somente a Edge Function poderá inserir respostas, usando a chave service_role no servidor.
drop policy if exists "cicm_respostas_insercao_publica" on public.cicm_portal_respostas;
revoke insert, update, delete on public.cicm_portal_respostas from anon, authenticated;
grant select on public.cicm_portal_respostas to anon, authenticated;

-- CRÍTICO: remover a permissão de fazer upload em 'respostas' no bucket público.
drop policy if exists "cicm_upload_publico" on storage.objects;
create policy "cicm_upload_publico" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'cicm_publico'
    and name ~ '^pedidos/[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png)$'
  );

-- Storage privado para respostas novas e não publicadas. Sem políticas para anon/authenticated.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('cicm_respostas_privado','cicm_respostas_privado',false,15728640,
 array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'text/plain','image/jpeg','image/png','application/octet-stream']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

-- Importante: arquivos antigos já gravados em cicm_publico/respostas continuam públicos.
-- Para não expor dados sensíveis, remova-os ou migre-os manualmente para o bucket privado.
-- Evite documentos sigilosos: pedidos e respostas publicadas destinam-se a toda a turma.

-- Rodar no SQL Editor do Supabase CICM. Não apaga anexos existentes.
-- OBS: plano Free permite no máximo 50 MB por arquivo. Para 100 MB,
-- é necessário plano com limite global >= 100 MB, ajustado em Storage > Settings.
ALTER TABLE public.cicm_portal_recados_anexos
 DROP CONSTRAINT IF EXISTS cicm_portal_recados_anexos_arquivo_tamanho_check;
ALTER TABLE public.cicm_portal_recados_anexos
 ADD CONSTRAINT cicm_portal_recados_anexos_arquivo_tamanho_check
 CHECK (arquivo_tamanho > 0 AND arquivo_tamanho <= 104857600);
-- Bucket privado, todos os tipos MIME permitidos.
-- Execute esta atualização somente após aumentar o limite global no painel (plano compatível).
UPDATE storage.buckets SET file_size_limit=104857600, allowed_mime_types=NULL, public=false
WHERE id='cicm_recados_privado';

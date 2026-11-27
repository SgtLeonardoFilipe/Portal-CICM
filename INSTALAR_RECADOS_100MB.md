# Portal CICM — anexos do mural até 100 MB

- Formulário: aceita qualquer extensão de arquivo; até 5 anexos de cada vez, 100 MiB por anexo.
- Upload em blocos de 6 MiB diretamente ao Storage, autorizado pelo código do instrutor. Não passa o arquivo completo pela Edge Function.
- Arquivos guardados em bucket privado, com download temporário. Para segurança, os anexos são gravados como `application/octet-stream` (download, não execução embutida no navegador).
- Os limites de pedidos e respostas permanecem em 15 MB.

## Antes de publicar

1. No projeto Supabase CICM (`ighfivcwykpyqfluifnf`), verifique o **plano**. **Free = máximo 50 MB por arquivo**; nessa modalidade 100 MB não funciona, independentemente da configuração do portal. No Pro ou superior, vá a **Storage > Settings** e aumente **Global file size limit** para pelo menos 100 MB.
2. No SQL Editor do projeto CICM, execute `supabase/migracao_recados_100mb.sql` (no plano Free, a atualização do bucket para 100 MB pode ser recusada; não insista antes de ajustar plano/limite global).
3. Atualize o código do projeto mantendo seu `.env` atual.
4. Execute `npx supabase link --project-ref ighfivcwykpyqfluifnf` e `npx supabase functions deploy area-instrutor --no-verify-jwt`.
5. Rode `npm install && npm run dev`. Teste primeiro com arquivo pequeno e depois com arquivo maior, verificando anexos e downloads.

**Nota**: aceitar qualquer extensão pode permitir arquivos perigosos. Oriente os alunos a só baixar arquivos esperados e mantenha antivírus e proteções no dispositivo; nunca execute arquivos desconhecidos.

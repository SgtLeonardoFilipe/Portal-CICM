# Portal CICM — Alunos + Instrutores (sem contas individuais)

Versão adaptada a partir do projeto CICM enviado. **Não apaga os pedidos/respostas existentes.** Mantém o visual, o brasão e o aviso por e-mail opcional.

## Endereços

- **Alunos:** `https://seu-site.com/` ou `https://seu-site.com/alunos`. Sem login. Enviam pedidos/relatórios e baixam respostas **publicadas**.
- **Instrutores:** `https://seu-site.com/instrutores`. O link não aparece na navegação dos alunos. Instrutores informam apenas um **código compartilhado**, sem cadastro de usuários. Podem baixar pedidos, salvar respostas em **rascunho** e clicar em **Publicar** para liberar a toda a turma.

> **Segurança:** URL escondida por si só não protege nada. O código é validado por uma Edge Function no servidor, nunca no React. Não compartilhe o código com alunos. Se o código vazar, troque-o nas configurações da Edge Function. Não há controle individual de autores nem proteção completa contra tentativas repetidas; considere Cloudflare Turnstile/rate limiting caso o site seja público na internet.

## Atualizar o projeto que já está rodando

1. Faça backup da pasta atual e do Supabase antes de atualizar.
2. Extraia o ZIP em uma pasta separada; copie seu `.env` **local** para a nova pasta (o ZIP não contém suas credenciais). Preserve sua URL e chave **pública** de Supabase.
3. No Supabase → SQL Editor, execute **`supabase/migracao_areas.sql`**. **Não execute `schema.sql` novamente**: a migração é para o seu banco existente.
4. Configure o código do instrutor **apenas como segredo do Supabase Edge Functions**. Gere uma sequência aleatória de pelo menos 16 caracteres, preferencialmente 32 ou mais:
   ```powershell
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase secrets set CICM_INSTRUCTOR_CODE="SEU_CODIGO_FORTE_COM_32_CARACTERES"
   npx supabase functions deploy area-instrutor --no-verify-jwt
   ```
   Use **Supabase CLI** instalado ou via `npx`. O Supabase disponibiliza automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` ao executar a função. **Nunca** configure `CICM_INSTRUCTOR_CODE` ou `SUPABASE_SERVICE_ROLE_KEY` no `.env` do Vite, GitHub, frontend ou navegador.
5. Na pasta nova, execute:
   ```powershell
   npm install
   npm run dev
   ```
6. Abra `/` e faça um envio de teste usando arquivo **fictício**. Acesse `/instrutores`, informe o código, crie a resposta em rascunho e confira que ela não aparece na área do aluno. Depois clique **Publicar** e confira o download pelo aluno.
7. Se hospedar no Render como site estático, configure o fallback de todas as rotas para `/index.html` (rewrite) para que atualizar `/instrutores` não produza 404.

## O que acontece com arquivos antigos?

- Os pedidos existentes continuam na tabela `cicm_portal_pedidos` e no bucket `cicm_publico`.
- As respostas antigas recebem `publicada=true` e seguem publicadas, pois já estavam disponíveis para todos.
- **Atenção:** arquivos antigos em `cicm_publico/respostas/` ainda permanecem públicos pelo URL do Storage, independentemente do novo painel. Novas respostas ficam no bucket **privado** `cicm_respostas_privado`, inclusive após publicação; o sistema emite links temporários de download apenas para respostas publicadas (ou para instrutor com o código).
- Não coloque dados de investigações reais, sigilosos ou pessoais no portal público. Mesmo pedidos dos alunos são públicos para qualquer pessoa que conheça o site.

## E-mail de notificação

A função `supabase/functions/avisar-instrutor/index.ts` foi mantida. Se você já configurou o webhook e o Resend, o alerta de novo **pedido** continua funcionando. Se ainda não configurou, veja as instruções da versão anterior; o e-mail não estará ativo até cadastrar o remetente, os segredos e o webhook de INSERT em `cicm_portal_pedidos`.

## Estrutura alterada

- `src/App.jsx`: separação de interface por rota, fluxos de rascunho e publicação.
- `src/supabase.js`: API de respostas via Edge Function, downloads temporários.
- `supabase/migracao_areas.sql`: RLS e Storage, sem exclusão de arquivos anteriores.
- `supabase/functions/area-instrutor/index.ts`: ações protegidas por código no servidor.
- `supabase/functions/avisar-instrutor`: código existente de notificação preservado.

## Observações de produção

- A aplicação não identifica individualmente quem publicou respostas: todos os instrutores compartilham o código.
- Arquivos enviados anonimamente podem ser abusivos; limite tamanho e formatos, aplique rate limiting/CAPTCHA e monitore o Storage.
- Antes de usar com materiais reais, adote autenticação de usuários e restrições de acesso adequadas.
- O sistema não remove automaticamente arquivos órfãos se o upload de pedido ocorrer mas a inserção no banco falhar.

## Atualização: exclusão de arquivos pelo instrutor

Esta versão adiciona, na área `/instrutores`, os botões **Excluir** em cada resposta (rascunho ou publicada) e **Excluir pedido e respostas** em cada pedido.

1. **Faça um backup** dos dados e arquivos importantes antes de atualizar. A exclusão não pode ser desfeita.
2. No Supabase → **SQL Editor**, execute `supabase/migracao_exclusao_instrutor.sql` (após `migracao_areas.sql`). O SQL cria as rotinas de exclusão transacional; **não remove documentos** por si só.
3. No terminal, dentro desta pasta e com o projeto Supabase vinculado, execute:

   ```powershell
   npx supabase functions deploy area-instrutor --no-verify-jwt
   ```

4. Reinicie o portal se necessário (`npm run dev`), acesse `/instrutores`, informe seu código habitual e teste com um arquivo fictício.

### Comportamento

- Excluir **uma resposta** remove somente a resposta selecionada. O pedido e outras respostas permanecem.
- Excluir **um pedido** remove o pedido, **todas as respostas** associadas, inclusive rascunhos, e os respectivos arquivos do Storage.
- O servidor exige o `CICM_INSTRUCTOR_CODE` em toda exclusão. Alunos não recebem botões nem permissão direta para excluir registros pelo Supabase.
- Se a limpeza no Storage falhar após a exclusão dos registros, a interface mostra um alerta; verifique os logs da Edge Function e remova os objetos restantes manualmente. Os arquivos antigos em bucket público podem continuar acessíveis por URLs já conhecidas até essa limpeza.
- Não execute o `schema.sql` para atualizar uma instalação existente: utilize **somente a nova migração**.

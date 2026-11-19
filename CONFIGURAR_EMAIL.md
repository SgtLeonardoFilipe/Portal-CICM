# Portal CICM — e-mail automático para instrutores

Esta atualização modifica somente a função `supabase/functions/avisar-instrutor/index.ts`. As telas, os dados e as funções de exclusão não foram alterados.

## 1. Serviço de envio

Crie uma conta no https://resend.com e uma API Key; verifique seu domínio de envio e use um endereço dele como `REMETENTE_EMAIL`. Para testes sem domínio verificado, confira as restrições atuais do Resend (geralmente envio apenas para o endereço do próprio titular com remetente de teste).

## 2. Configurar secrets no Supabase

No PowerShell, dentro do projeto vinculado ao Supabase:

```powershell
npx supabase secrets set RESEND_API_KEY="SUA_API_KEY_RESEND"
npx supabase secrets set REMETENTE_EMAIL="avisos@SEU_DOMINIO_VERIFICADO.com.br"
npx supabase secrets set INSTRUTOR_EMAIL="instrutor1@exemplo.com,instrutor2@exemplo.com"
npx supabase secrets set PORTAL_URL="https://SEU-SITE.onrender.com"
npx supabase secrets set WEBHOOK_SECRET="UM_SEGREDO_ALEATORIO_FORTE"
npx supabase functions deploy avisar-instrutor --no-verify-jwt
```

Não publique os valores desses secrets no GitHub, `.env` com prefixo `VITE_`, ou screenshots.

## 3. Configurar Database Webhook

No Supabase Dashboard > Database > Webhooks > Create a new webhook:

- Nome: `cicm-novo-pedido`
- Tabela: `public.cicm_portal_pedidos`
- Evento: `INSERT` (somente)
- Tipo: Supabase Edge Functions
- Função: `avisar-instrutor`
- Header adicional: `x-webhook-secret` com o mesmo valor de `WEBHOOK_SECRET`

Salve. Não crie webhook de UPDATE ou DELETE para evitar notificações indevidas. Se já houver webhook de novo pedido, **edite o existente**; não duplique.

## 4. Teste

Acesse a área pública e envie um pedido de teste. Em Supabase > Edge Functions > `avisar-instrutor` > Logs, confira a execução. O e-mail deve chegar aos endereços em `INSTRUTOR_EMAIL`. Se não chegar, cheque também Resend > Emails e os logs do webhook.

Um envio concluído no portal não garante entrega do e-mail (provedor externo). Não são enviados anexos e não se devem usar dados reais/sigilosos no portal público.

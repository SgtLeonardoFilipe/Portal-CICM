# Mural de Recados — Portal CICM

## Instalação

1. Faça backup do projeto e do Supabase.
2. No Supabase do Portal CICM, abra **SQL Editor** e execute `supabase/migracao_recados.sql`. Ele cria só a tabela de recados e suas regras; não altera os arquivos existentes.
3. No terminal, dentro da pasta do projeto, execute `npx supabase functions deploy area-instrutor --no-verify-jwt` (com a CLI já vinculada ao projeto correto). **Não** altere `CICM_INSTRUCTOR_CODE` ou a service role.
4. Atualize o frontend em seu serviço de hospedagem (normalmente via Git e novo deploy). Localmente, use `npm install` e `npm run build` para testar.

## Uso

- Alunos: abrem **Mural de recados** e leem as mensagens publicadas. Não há necessidade de login.
- Instrutores: abrem `/instrutores`, informam o código de acesso, selecionam **Mural de recados** e clicam em **Novo recado**. Podem marcar **Aviso importante**, editar ou excluir.
- Os comunicados são visíveis **para toda a turma**; não há envio de e-mail, SMS, WhatsApp nem confirmação individual de leitura nesta versão.
- Não publique conteúdo sigiloso ou dados pessoais: qualquer visitante que tenha o endereço do portal pode consultar os recados.
- A proteção para escrita é feita na função do servidor, nunca no código da página.

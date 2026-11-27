# Anexos nos Recados — Portal CICM

## Antes de atualizar

Faça backup do projeto. As alterações não apagam dados, recados nem arquivos existentes.

## 1 — Banco correto

No SQL Editor do projeto **CICM** (`ighfivcwykpyqfluifnf`), execute **`supabase/migracao_anexos_recados.sql`**. Isto cria a tabela de anexos e o bucket privado `cicm_recados_privado`. Não execute no OPERSAI.

## 2 — Função

No terminal da pasta Portal-CICM:

```bash
npx supabase link --project-ref ighfivcwykpyqfluifnf
npx supabase functions deploy area-instrutor --no-verify-jwt
```

Confirme no terminal que o deploy ocorreu no projeto CICM. Mantenha os secrets existentes; nenhum novo secret é necessário.

## 3 — Frontend

Atualize os arquivos do projeto, execute `npm install`, `npm run build`, `npm run dev` para testar e depois publique no serviço atual.

## 4 — Uso

- Na Área do Instrutor > Mural de Recados, ao criar ou editar, selecione até **5 arquivos por envio** (cada um de até **15 MB**). Limite de **20 anexos por recado**.
- Tipos: PDF, Word, Excel, PowerPoint, TXT, JPG, JPEG e PNG.
- No recado, alunos e instrutores usam **Baixar**. O sistema gera link temporário de 60 segundos.
- Em **Editar**, o instrutor pode anexar outros arquivos ou remover anexos existentes. Ao excluir um recado, os anexos são removidos do banco e do Storage.
- Se a rede falhar durante upload, o recado pode ter sido salvo e os primeiros anexos podem estar presentes. Verifique a lista antes de reenviar.
- O mural é público para quem acessa a URL do Portal CICM: não anexe dados pessoais ou documentos sigilosos.

## Observação

O campo de recado permanece obrigatório. A função protege o envio com o código de instrutor validado no servidor. O bucket não é público; os downloads são autorizados por existência do anexo em recado público.

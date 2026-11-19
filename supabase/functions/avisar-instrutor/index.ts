// Notifica os instrutores quando um novo pedido é inserido no Portal CICM.
// Invocada apenas pelo Database Webhook (INSERT em public.cicm_portal_pedidos).
// Nunca coloque os segredos abaixo no frontend (VITE_*).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const env = (name: string) => Deno.env.get(name)?.trim() ?? '';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c] ?? c));

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });

  const secret = env('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Não autorizado', { status: 401 });
  }

  const apiKey = env('RESEND_API_KEY');
  const remetente = env('REMETENTE_EMAIL');
  // Aceita um ou vários e-mails separados por vírgula.
  const destinatarios = env('INSTRUTOR_EMAIL').split(',').map(s => s.trim()).filter(Boolean);
  if (!apiKey || !remetente || !destinatarios.length) {
    console.error('Configuração de e-mail incompleta');
    return new Response('Configuração incompleta', { status: 500 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return new Response('JSON inválido', { status: 400 }); }

  if (body?.type !== 'INSERT' || body?.table !== 'cicm_portal_pedidos' || !body?.record?.id) {
    return new Response('Evento ignorado', { status: 200 });
  }

  const d = body.record;
  const portal = env('PORTAL_URL');
  let painel = '';
  if (portal) {
    try {
      const u = new URL(portal);
      if (u.protocol === 'https:' || u.hostname === 'localhost') {
        painel = `<p><a href="${escapeHtml(new URL('/instrutores', u).toString())}">Abrir área dos instrutores</a></p>`;
      }
    } catch { console.warn('PORTAL_URL inválida; e-mail será enviado sem link'); }
  }

  const conteudo = `<h2>Portal CICM: novo documento recebido</h2>
    <p><b>Aluno:</b> ${escapeHtml(d.nome)}</p>
    <p><b>Equipe:</b> ${escapeHtml(d.equipe)}</p>
    <p><b>Categoria:</b> ${escapeHtml(d.categoria)}</p>
    <p><b>Título:</b> ${escapeHtml(d.titulo)}</p>
    <p><b>Enviado em:</b> ${escapeHtml(d.criado_em)}</p>
    ${painel}<p>Acesse o portal para consultar o documento. O arquivo não foi anexado a este e-mail.</p>`;

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: destinatarios,
        subject: `CICM | Novo documento: ${String(d.titulo ?? '').slice(0, 100)}`,
        html: conteudo,
      }),
    });
    if (!resposta.ok) {
      const detalhe = await resposta.text();
      console.error('Resend recusou notificação', resposta.status, detalhe.slice(0, 300));
      return new Response('Falha no provedor de e-mail', { status: 502 });
    }
    return new Response('Notificação enviada', { status: 200 });
  } catch (erro) {
    console.error('Erro de comunicação com provedor', String(erro));
    return new Response('Falha ao enviar e-mail', { status: 502 });
  }
});

// Edge Function invocada por Database Webhook ao inserir em cicm_portal_pedidos.
// NÃO disponibiliza a chave Resend ao navegador. Endpoint autenticado por segredo do webhook.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const INSTRUTOR_EMAIL = Deno.env.get('INSTRUTOR_EMAIL');
const REMETENTE_EMAIL = Deno.env.get('REMETENTE_EMAIL');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const PORTAL_URL = Deno.env.get('PORTAL_URL') || '';
function html(s: unknown) {return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));}
serve(async req => {
  if (req.method !== 'POST') return new Response('Método não permitido',{status:405});
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET)
    return new Response('Não autorizado',{status:401});
  if (!RESEND_API_KEY || !INSTRUTOR_EMAIL || !REMETENTE_EMAIL)
    return new Response('Faltam variáveis de ambiente',{status:500});
  let body;
  try { body = await req.json(); } catch {return new Response('JSON inválido',{status:400});}
  if(body?.type!=='INSERT' || body?.table!=='cicm_portal_pedidos' || !body?.record?.id)
    return new Response('Evento ignorado',{status:200});
  const d=body.record;
  const mensagem=`<h2>Novo documento no Portal CICM</h2><p><b>Título:</b> ${html(d.titulo)}</p><p><b>Categoria:</b> ${html(d.categoria)}</p><p><b>Aluno:</b> ${html(d.nome)}</p><p><b>Equipe:</b> ${html(d.equipe)}</p><p><b>Data:</b> ${html(d.criado_em)}</p><p>Acesse o Portal CICM para baixar o pedido e anexar a resposta.</p>${PORTAL_URL?`<p><a href="${html(PORTAL_URL)}">Abrir Portal CICM</a></p>`:''}<p>Não responda a este e-mail.</p>`;
  const resp=await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:REMETENTE_EMAIL,to:[INSTRUTOR_EMAIL],subject:`Portal CICM — Novo arquivo: ${String(d.titulo||'').slice(0,90)}`,html:mensagem})
  });
  if (!resp.ok) return new Response(`Falha no envio do e-mail: ${resp.status}`,{status:502});
  return new Response('Notificação enviada',{status:200});
});

import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!(url && key && !url.includes('SEU-PROJETO'));
export const supabase = configured ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
}) : null;
export const BUCKET = 'cicm_publico';
export const TIPOS = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','jpg','jpeg','png'];
export const LIMITE = 15 * 1024 * 1024;
export function validarArquivo(file) {
  if (!file) throw new Error('Selecione um arquivo.');
  if (file.size === 0 || file.size > LIMITE) throw new Error('Arquivo vazio ou maior que 15 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!TIPOS.includes(ext)) throw new Error('Formato não permitido.');
  return ext;
}
export function falha(error) { if (error) throw error; }
export async function enviarPedidoArquivo(file) {
  const ext = validarArquivo(file);
  const caminho = `pedidos/${crypto.randomUUID()}.${ext}`;
  const {error} = await supabase.storage.from(BUCKET).upload(caminho, file, {
    upsert: false, contentType: file.type || 'application/octet-stream'
  });
  falha(error); return caminho;
}
export async function baixarBlob(blob, nome) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=u; a.download=nome || 'documento';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),60000);
}
export async function baixarPedido(path, nome) {
  const {data,error} = await supabase.storage.from(BUCKET).download(path);
  falha(error); await baixarBlob(data,nome);
}
export async function instrutorAPI(acao, codigo, payload={}) {
  const {data,error} = await supabase.functions.invoke('area-instrutor', {
    body:{acao,...payload}, headers:{'x-instructor-code':codigo || ''}
  });
  if(error) {
    let msg = error.message;
    try { const d = await error.context?.json(); msg = d?.erro || msg; } catch{}
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}
export async function enviarRascunho(codigo, pedidoId, nome, file) {
  validarArquivo(file);
  const form = new FormData();
  form.append('acao','criar-rascunho'); form.append('pedido_id',pedidoId);
  form.append('nome',nome); form.append('arquivo',file);
  const {data,error} = await supabase.functions.invoke('area-instrutor', {
    body: form, headers: {'x-instructor-code':codigo}
  });
  if(error){ let msg=error.message; try { const d=await error.context?.json(); msg=d?.erro || msg; } catch{} throw new Error(msg); }
  if(data?.erro) throw new Error(data.erro);
  return data;
}
export async function baixarResposta(resposta, codigo='') {
  // Os arquivos antigos, já publicados no bucket público, continuam acessíveis.
  if(resposta.arquivo_path?.startsWith('respostas/'))
    return baixarPedido(resposta.arquivo_path,resposta.arquivo_nome);
  const {url:arquivoUrl} = await instrutorAPI('link-resposta', codigo, {resposta_id:resposta.id});
  if(!arquivoUrl) throw new Error('Arquivo não disponível.');
  const resp = await fetch(arquivoUrl);
  if(!resp.ok) throw new Error('Não foi possível baixar a resposta.');
  await baixarBlob(await resp.blob(),resposta.arquivo_nome);
}

// Anexos enviados somente pela função protegida pelo código do instrutor.
export async function enviarAnexoRecado(codigo,recadoId,file) {
  validarArquivo(file);
  const form=new FormData();
  form.append('acao','anexar-recado');form.append('recado_id',recadoId);form.append('arquivo',file);
  const {data,error}=await supabase.functions.invoke('area-instrutor',{
    body:form,headers:{'x-instructor-code':codigo}
  });
  if(error){let message=error.message;try{const d=await error.context?.json();message=d?.erro||message}catch{}throw new Error(message)}
  if(data?.erro)throw new Error(data.erro);
  return data;
}
export async function baixarAnexoRecado(anexo) {
  const {url:arquivoUrl}=await instrutorAPI('link-anexo-recado','',{anexo_id:anexo.id});
  if(!arquivoUrl)throw new Error('Arquivo não disponível.');
  const resp=await fetch(arquivoUrl);
  if(!resp.ok)throw new Error('Não foi possível baixar o arquivo.');
  await baixarBlob(await resp.blob(),anexo.arquivo_nome);
}

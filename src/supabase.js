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

// Anexos do mural: qualquer extensão, máximo de 100 MiB por arquivo.
// O código do instrutor autoriza a URL assinada; o navegador envia em partes ao Storage.
export const LIMITE_ANEXO_RECADO = 100 * 1024 * 1024;
export function validarAnexoRecado(file) {
  if (!file) throw new Error('Selecione um arquivo para o recado.');
  if (file.size <= 0 || file.size > LIMITE_ANEXO_RECADO)
    throw new Error('O anexo deve ter no máximo 100 MB.');
  if (!file.name || file.name.length > 255)
    throw new Error('Nome de arquivo inválido ou muito longo (máximo 255 caracteres).');
}
function base64Meta(value) {
  return btoa(Array.from(new TextEncoder().encode(value), byte => String.fromCharCode(byte)).join(''));
}
async function tusEnviarArquivo(file,path,token,onProgress=()=>{}) {
  const endereco = new URL(import.meta.env.VITE_SUPABASE_URL);
  // Host direto recomendado para arquivos grandes; funciona com projetos Supabase hospedados.
  const host = endereco.hostname.endsWith('.supabase.co')
    ? endereco.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')
    : endereco.hostname;
  const endpoint = `${endereco.protocol}//${host}/storage/v1/upload/resumable`;
  const headers = {'Tus-Resumable':'1.0.0','x-signature':token};
  const metadata = {
    bucketName:'cicm_recados_privado',objectName:path,
    contentType:'application/octet-stream',cacheControl:'3600'
  };
  const metadados = Object.entries(metadata).map(([key,value])=>`${key} ${base64Meta(value)}`).join(',');
  const init = await fetch(endpoint,{
    method:'POST',headers:{...headers,'Upload-Length':String(file.size),'Upload-Metadata':metadados}
  });
  if(!init.ok)throw new Error(`Falha ao iniciar envio (${init.status}). Confira os limites do Storage.`);
  const location=init.headers.get('Location');
  if(!location)throw new Error('Storage não retornou o endereço para envio em partes.');
  const uploadUrl=new URL(location,endpoint).toString();
  let offset=0;
  const chunkSize=6*1024*1024;
  while(offset<file.size){
    let enviado=false;
    for(let attempt=0;attempt<5&&!enviado;attempt++){
      try{
        const resp=await fetch(uploadUrl,{
          method:'PATCH',headers:{...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},
          body:file.slice(offset,Math.min(offset+chunkSize,file.size))
        });
        if(!resp.ok)throw new Error(`Falha no envio (${resp.status})`);
        const offsetHeader=resp.headers.get('Upload-Offset');
        const next=offsetHeader==null ? Math.min(offset+chunkSize,file.size) : Number(offsetHeader);
        if(!Number.isFinite(next)||next<=offset)throw new Error('Progresso do upload inválido');
        offset=next;enviado=true;onProgress(Math.min(100,Math.round(offset/file.size*100)));
      }catch(error){
        if(attempt===4)throw error;
        await new Promise(r=>setTimeout(r,1000*(attempt+1)));
        const head=await fetch(uploadUrl,{method:'HEAD',headers});
        if(head.ok){const remoto=Number(head.headers.get('Upload-Offset'));if(Number.isFinite(remoto)&&remoto>=0)offset=remoto;}
        if(offset>=file.size){enviado=true;onProgress(100);}
      }
    }
  }
}
export async function enviarAnexoRecado(codigo,recadoId,file,onProgress=()=>{}) {
  validarAnexoRecado(file);
  const {path,token}=await instrutorAPI('preparar-anexo-recado',codigo,{
    recado_id:recadoId,arquivo_nome:file.name,arquivo_tamanho:file.size
  });
  if(!path||!token)throw new Error('O Supabase não autorizou o envio.');
  await tusEnviarArquivo(file,path,token,onProgress);
  return instrutorAPI('confirmar-anexo-recado',codigo,{
    recado_id:recadoId,arquivo_path:path,arquivo_nome:file.name,arquivo_tamanho:file.size
  });
}
export async function baixarAnexoRecado(anexo) {
  const {url:arquivoUrl}=await instrutorAPI('link-anexo-recado','',{anexo_id:anexo.id});
  if(!arquivoUrl)throw new Error('Arquivo não disponível.');
  const resp=await fetch(arquivoUrl);
  if(!resp.ok)throw new Error('Não foi possível baixar o arquivo.');
  await baixarBlob(await resp.blob(),anexo.arquivo_nome);
}

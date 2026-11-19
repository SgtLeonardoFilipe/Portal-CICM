// Deploy com --no-verify-jwt: autorização pelo código privado validado NO SERVIDOR.
// Nunca coloque CICM_INSTRUCTOR_CODE ou SUPABASE_SERVICE_ROLE_KEY no Vite.
import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const CODE=Deno.env.get('CICM_INSTRUCTOR_CODE')||'';
const BUCKET='cicm_respostas_privado';
const extensions=new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','jpg','jpeg','png']);
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-instructor-code',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(message:string,status=400)=>json({erro:message},status);
async function sameSecret(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  const enc=new TextEncoder(); const [x,y]=await Promise.all([
    crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))
  ]);
  const v1=new Uint8Array(x),v2=new Uint8Array(y);let diff=0;
  for(let i=0;i<v1.length;i++)diff|=v1[i]^v2[i];return diff===0;
}
serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return fail('Método não permitido',405);
  if(!SUPABASE_URL||!SERVICE_KEY||!CODE||CODE.length<16)return fail('Configuração do servidor incompleta',503);
  try{
    const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
    const isForm=req.headers.get('content-type')?.includes('multipart/form-data')||false;
    const body=isForm?await req.formData():await req.json();
    const acao=String(isForm?body.get('acao'):body.acao||'');
    const autorizado=await sameSecret(req.headers.get('x-instructor-code')||'',CODE);

    if(acao==='link-resposta'){
      const id=String(isForm?body.get('resposta_id'):body.resposta_id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id))return fail('Resposta inválida');
      const {data:r,error}=await admin.from('cicm_portal_respostas').select('id,arquivo_path,publicada').eq('id',id).single();
      if(error||!r)return fail('Resposta não encontrada',404);
      if(!r.publicada&&!autorizado)return fail('Resposta ainda não publicada',403);
      if(!r.arquivo_path.startsWith('privado/'))return fail('Resposta antiga: utilize download público',400);
      const {data,error:err}=await admin.storage.from(BUCKET).createSignedUrl(r.arquivo_path,60);
      if(err||!data)return fail('Não foi possível criar link de download',500);
      return json({url:data.signedUrl});
    }

    if(!autorizado)return fail('Código inválido',401);
    if(acao==='listar-rascunhos'){
      const {data,error}=await admin.from('cicm_portal_respostas').select('id,pedido_id,nome,arquivo_nome,arquivo_path,criado_em').eq('publicada',false).order('criado_em',{ascending:false});
      if(error)return fail('Falha ao listar rascunhos',500);
      return json({rascunhos:data||[]});
    }
    if(acao==='criar-rascunho'){
      if(!isForm)return fail('Envie o arquivo como formulário');
      const id=String(body.get('pedido_id')||'');
      const nome=String(body.get('nome')||'').trim();
      const file=body.get('arquivo');
      if(!/^[0-9a-f-]{36}$/i.test(id)||nome.length<1||nome.length>120||!(file instanceof File))return fail('Preencha os campos');
      if(!file.size||file.size>15728640||file.name.length>255)return fail('Tamanho ou nome inválido');
      const ext=file.name.split('.').pop()?.toLowerCase()||'';
      if(!extensions.has(ext))return fail('Formato não permitido');
      const {data:pedido}=await admin.from('cicm_portal_pedidos').select('id').eq('id',id).maybeSingle();
      if(!pedido)return fail('Pedido não encontrado',404);
      const path=`privado/${crypto.randomUUID()}.${ext}`;
      const {error:uploadError}=await admin.storage.from(BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
      if(uploadError)return fail('Falha no envio: '+uploadError.message,500);
      const {data:salva,error}=await admin.from('cicm_portal_respostas').insert({
        pedido_id:id,nome,arquivo_path:path,arquivo_nome:file.name,publicada:false
      }).select('id').single();
      if(error){await admin.storage.from(BUCKET).remove([path]);return fail('Falha ao salvar a resposta',500)}
      return json({id:salva.id});
    }
    if(acao==='excluir-resposta' || acao==='excluir-pedido'){
      const id=String(body.resposta_id || body.pedido_id || '');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        return fail('Identificador inválido');
      const apenasResposta=acao==='excluir-resposta';
      const {data:removidos,error:deleteError}=await admin.rpc(
        apenasResposta?'cicm_excluir_resposta':'cicm_excluir_pedido',
        apenasResposta?{p_resposta_id:id}:{p_pedido_id:id}
      );
      if(deleteError)return fail('Falha ao excluir: '+deleteError.message,500);
      const paths=apenasResposta?[removidos.arquivo_path]:[
        removidos.pedido_path,...(removidos.resposta_paths||[])
      ];
      // Banco removido primeiro em uma transação. Se o Storage falhar,
      // a resposta informa os caminhos para limpeza manual, sem fingir sucesso total.
      const buckets:Record<string,string[]>={
        cicm_publico:[],cicm_respostas_privado:[]
      };
      for(const path of paths){
        if(typeof path!=='string')continue;
        if(path.startsWith('privado/'))buckets.cicm_respostas_privado.push(path);
        else if(path.startsWith('pedidos/')||path.startsWith('respostas/'))buckets.cicm_publico.push(path);
      }
      const falhas:string[]=[];
      for(const [bucket,arquivos] of Object.entries(buckets)){
        if(!arquivos.length)continue;
        // O Storage aceita até 1000 caminhos por remoção.
        for(let i=0;i<arquivos.length;i+=100){
          const lote=arquivos.slice(i,i+100);
          const {error:storageError}=await admin.storage.from(bucket).remove(lote);
          if(storageError)falhas.push(`${bucket}: ${lote.join(', ')} (${storageError.message})`);
        }
      }
      return json({ok:true,arquivos_pendentes:falhas});
    }
    if(acao==='publicar'){
      const id=String(body.resposta_id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id))return fail('Resposta inválida');
      const {data,error}=await admin.from('cicm_portal_respostas').update({publicada:true}).eq('id',id).eq('publicada',false).select('id').maybeSingle();
      if(error)return fail('Falha ao publicar',500);
      if(!data)return fail('Resposta não encontrada ou já publicada',404);
      return json({ok:true});
    }
    return fail('Ação desconhecida',400);
  }catch(e){return fail('Requisição inválida',400)}
});

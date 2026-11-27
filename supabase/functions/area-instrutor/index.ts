// Deploy com --no-verify-jwt: autorização pelo código privado validado NO SERVIDOR.
// Nunca coloque CICM_INSTRUCTOR_CODE ou SUPABASE_SERVICE_ROLE_KEY no Vite.
import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const CODE=Deno.env.get('CICM_INSTRUCTOR_CODE')||'';
const BUCKET='cicm_respostas_privado';
const RECADO_BUCKET='cicm_recados_privado';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

    // Alunos recebem links temporários para anexos de recados publicados.
    if(acao==='link-anexo-recado'){
      const id=String(isForm?body.get('anexo_id'):body.anexo_id||'');
      if(!uuid.test(id))return fail('Anexo inválido');
      const {data,error}=await admin.from('cicm_portal_recados_anexos').select('arquivo_path').eq('id',id).maybeSingle();
      if(error||!data)return fail('Anexo não encontrado',404);
      const {data:link,error:storageError}=await admin.storage.from(RECADO_BUCKET).createSignedUrl(data.arquivo_path,60);
      if(storageError||!link)return fail('Não foi possível acessar o anexo',500);
      return json({url:link.signedUrl});
    }

    if(!autorizado)return fail('Código inválido',401);
    // Arquivos grandes nunca passam pela Edge Function: somente autorização e confirmação.
    if(acao==='preparar-anexo-recado'){
      if(isForm)return fail('Formato inválido');
      const id=String(body.recado_id||'');
      const nome=String(body.arquivo_nome||'').trim();
      const tamanho=Number(body.arquivo_tamanho);
      if(!uuid.test(id)||!nome||nome.length>255||!Number.isSafeInteger(tamanho)||tamanho<1||tamanho>104857600)
        return fail('Arquivo inválido ou maior que 100 MB');
      const {data:recado,error:recadoError}=await admin.from('cicm_portal_recados').select('id').eq('id',id).maybeSingle();
      if(recadoError||!recado)return fail('Recado não encontrado',404);
      const {count,error:countError}=await admin.from('cicm_portal_recados_anexos').select('id',{count:'exact',head:true}).eq('recado_id',id);
      if(countError)return fail('Falha ao consultar anexos',500);
      if((count||0)>=20)return fail('Limite de 20 anexos por recado');
      // Caminho aleatório, sem utilizar nome/extensão fornecidos pelo usuário no Storage.
      const path=`recados/${id}/${crypto.randomUUID()}`;
      const {data,error}=await admin.storage.from(RECADO_BUCKET).createSignedUploadUrl(path);
      if(error||!data)return fail('Não foi possível autorizar upload: '+(error?.message||'erro desconhecido'),500);
      return json({path,token:data.token});
    }
    if(acao==='confirmar-anexo-recado'){
      if(isForm)return fail('Formato inválido');
      const id=String(body.recado_id||'');
      const path=String(body.arquivo_path||'');
      const nome=String(body.arquivo_nome||'').trim();
      const tamanho=Number(body.arquivo_tamanho);
      if(!uuid.test(id)||!nome||nome.length>255||!Number.isSafeInteger(tamanho)||tamanho<1||tamanho>104857600 ||
         !new RegExp(`^recados/${id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,'i').test(path))return fail('Dados do anexo inválidos');
      const {data:recado}=await admin.from('cicm_portal_recados').select('id').eq('id',id).maybeSingle();
      if(!recado)return fail('Recado não encontrado',404);
      const {count}=await admin.from('cicm_portal_recados_anexos').select('id',{count:'exact',head:true}).eq('recado_id',id);
      if((count||0)>=20)return fail('Limite de 20 anexos por recado');
      const pasta=`recados/${id}`;
      const arquivo=path.slice(pasta.length+1);
      const {data:objetos,error:storageError}=await admin.storage.from(RECADO_BUCKET).list(pasta,{limit:100,search:arquivo});
      const objeto=(objetos||[]).find(o=>o.name===arquivo);
      if(storageError||!objeto)return fail('O upload ainda não foi concluído',409);
      const realSize=Number(objeto.metadata?.size??0);
      if(!realSize||realSize!==tamanho||realSize>104857600)return fail('Tamanho do arquivo armazenado não confere',400);
      const {data:anexo,error}=await admin.from('cicm_portal_recados_anexos').insert({recado_id:id,arquivo_nome:nome,arquivo_path:path,arquivo_tamanho:tamanho}).select('id').single();
      if(error)return fail('Falha ao registrar o anexo: '+error.message,500);
      return json({ok:true,id:anexo.id});
    }
    if(acao==='anexar-recado')return fail('Atualize o portal: anexos agora usam upload em partes');
    if(acao==='excluir-anexo-recado'){
      if(isForm)return fail('Formato inválido');
      const id=String(body.anexo_id||'');
      if(!uuid.test(id))return fail('Anexo inválido');
      const {data,error}=await admin.from('cicm_portal_recados_anexos').delete().eq('id',id).select('arquivo_path').maybeSingle();
      if(error)return fail('Falha ao excluir anexo: '+error.message,500);
      if(!data)return fail('Anexo não encontrado',404);
      const {error:storageError}=await admin.storage.from(RECADO_BUCKET).remove([data.arquivo_path]);
      return json({ok:true,arquivo_pendente:storageError?.message||null});
    }

    if(acao==='criar-recado'||acao==='editar-recado'){
      if(isForm)return fail('Formato inválido');
      const titulo=String(body.titulo||'').trim(),conteudo=String(body.conteudo||'').trim(),autor=String(body.autor||'').trim();
      if(!titulo||titulo.length>180||!conteudo||conteudo.length>5000||!autor||autor.length>120||typeof body.importante!=='boolean')return fail('Preencha os campos do recado corretamente');
      const dados={titulo,conteudo,autor,importante:body.importante};
      if(acao==='criar-recado'){
        const {data,error}=await admin.from('cicm_portal_recados').insert(dados).select('id').single();
        if(error)return fail('Falha ao publicar recado: '+error.message,500);
        return json({ok:true,id:data.id});
      }
      const id=String(body.recado_id||'');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return fail('Recado inválido');
      const {data,error}=await admin.from('cicm_portal_recados').update(dados).eq('id',id).select('id').maybeSingle();
      if(error)return fail('Falha ao editar recado: '+error.message,500);
      if(!data)return fail('Recado não encontrado',404);
      return json({ok:true});
    }
    if(acao==='excluir-recado'){
      const id=String(body.recado_id||'');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return fail('Recado inválido');
      const {data:anexos,error:listaError}=await admin.from('cicm_portal_recados_anexos').select('arquivo_path').eq('recado_id',id);
      if(listaError)return fail('Falha ao listar anexos do recado',500);
      const {data,error}=await admin.from('cicm_portal_recados').delete().eq('id',id).select('id').maybeSingle();
      if(error)return fail('Falha ao excluir recado: '+error.message,500);
      if(!data)return fail('Recado não encontrado',404);
      const paths=(anexos||[]).map(a=>a.arquivo_path);
      const pendentes:string[]=[];
      for(let i=0;i<paths.length;i+=100){
        const lote=paths.slice(i,i+100);
        const {error:storageError}=await admin.storage.from(RECADO_BUCKET).remove(lote);
        if(storageError)pendentes.push(...lote);
      }
      return json({ok:true,arquivos_pendentes:pendentes});
    }
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

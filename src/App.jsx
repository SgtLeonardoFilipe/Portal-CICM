import React, {useEffect,useMemo,useState} from 'react';
import {Upload, Download, FolderOpen, Search, FileText, CheckCircle2, Clock3, RefreshCw, Mail, Send, X, ArrowLeft, Users, AlertTriangle, LockKeyhole, EyeOff, Eye, ShieldCheck, Trash2, Megaphone, Pencil, Pin} from 'lucide-react';
import {supabase,configured,falha,enviarPedidoArquivo,baixarPedido,baixarResposta,instrutorAPI,enviarRascunho,validarArquivo} from './supabase';

const CATEGORIAS=['Dados cadastrais','Pedidos ao Judiciário','Relatórios','Outros documentos'];
const dataBR=s=>s?new Date(s).toLocaleString('pt-BR'):'';
const msg=e=>e?.message||'Operação não concluída.';
const formularioInicial={nome:'',equipe:'',categoria:CATEGORIAS[0],titulo:'',arquivo:null};
const instrutor=window.location.pathname.replace(/\/+$/,'')==='/instrutores';

export default function App(){
  const [pedidos,setPedidos]=useState([]),[respostas,setRespostas]=useState([]),[rascunhos,setRascunhos]=useState([]);
  const [recados,setRecados]=useState([]),[editandoRecado,setEditandoRecado]=useState(null);
  const [recadoForm,setRecadoForm]=useState({titulo:'',conteudo:'',autor:'',importante:false});
  const [codigo,setCodigo]=useState(''),[autorizado,setAutorizado]=useState(false);
  const [aba,setAba]=useState('arquivos'),[filtro,setFiltro]=useState('Todos'),[busca,setBusca]=useState('');
  const [form,setForm]=useState(formularioInicial),[respostaPara,setRespostaPara]=useState(null);
  const [nomeResp,setNomeResp]=useState(''),[arquivoResp,setArquivoResp]=useState(null);
  const [carregando,setCarregando]=useState(false),[enviando,setEnviando]=useState(false),[baixando,setBaixando]=useState(''),[deletando,setDeletando]=useState('');
  const [erro,setErro]=useState(''),[aviso,setAviso]=useState('');

  async function carregarPublicos(){
    if(!configured)return;
    setCarregando(true);setErro('');
    try{
      const [p,r,rec]=await Promise.all([
        supabase.from('cicm_portal_pedidos').select('*').order('criado_em',{ascending:false}),
        supabase.from('cicm_portal_respostas').select('*').order('criado_em',{ascending:true}),
        supabase.from('cicm_portal_recados').select('*').order('importante',{ascending:false}).order('criado_em',{ascending:false})
      ]);
      falha(p.error);falha(r.error);falha(rec.error);setPedidos(p.data||[]);setRespostas(r.data||[]);setRecados(rec.data||[]);
    }catch(e){setErro(msg(e));}finally{setCarregando(false);}
  }
  useEffect(()=>{carregarPublicos()},[]);
  async function entrar(e){
    e.preventDefault();setErro('');setCarregando(true);
    try{
      const data=await instrutorAPI('listar-rascunhos',codigo);
      setRascunhos(data.rascunhos||[]);setAutorizado(true);
    }catch(e){setErro('Acesso não autorizado ou serviço indisponível: '+msg(e));}
    finally{setCarregando(false);}
  }
  async function atualizar(){
    await carregarPublicos();
    if(instrutor&&autorizado){
      try{const d=await instrutorAPI('listar-rascunhos',codigo);setRascunhos(d.rascunhos||[])}
      catch(e){setErro(msg(e));setAutorizado(false);}
    }
  }
  const porPedido=useMemo(()=>respostas.reduce((a,r)=>{(a[r.pedido_id] ||= []).push(r);return a},{}),[respostas]);
  const rascunhosPorPedido=useMemo(()=>rascunhos.reduce((a,r)=>{(a[r.pedido_id] ||= []).push(r);return a},{}),[rascunhos]);
  const visiveis=useMemo(()=>pedidos.filter(p=>(filtro==='Todos'||p.categoria===filtro)&&
    [p.nome,p.equipe,p.titulo,p.categoria].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))),[pedidos,filtro,busca]);
  const respondidos=pedidos.filter(p=>porPedido[p.id]?.length).length;
  async function novoPedido(e){
    e.preventDefault();setEnviando(true);setErro('');setAviso('');
    try{
      if(!form.nome.trim()||!form.equipe.trim()||!form.titulo.trim())throw new Error('Preencha nome, equipe e título.');
      validarArquivo(form.arquivo);
      const path=await enviarPedidoArquivo(form.arquivo);
      const {error}=await supabase.from('cicm_portal_pedidos').insert({
        nome:form.nome.trim(),equipe:form.equipe.trim(),categoria:form.categoria,
        titulo:form.titulo.trim(),arquivo_path:path,arquivo_nome:form.arquivo.name
      });
      falha(error);setForm(formularioInicial);setAba('arquivos');setAviso('Arquivo enviado e disponível para a turma.');await carregarPublicos();
    }catch(e){setErro(msg(e));}finally{setEnviando(false)}
  }
  async function criarRascunho(e){
    e.preventDefault();setEnviando(true);setErro('');setAviso('');
    try{
      if(!nomeResp.trim())throw new Error('Informe o nome do instrutor.');
      await enviarRascunho(codigo,respostaPara.id,nomeResp.trim(),arquivoResp);
      setRespostaPara(null);setNomeResp('');setArquivoResp(null);
      setAviso('Resposta salva como rascunho. Os alunos ainda não podem baixá-la.');await atualizar();
    }catch(e){setErro(msg(e));}finally{setEnviando(false)}
  }
  async function publicar(resposta){
    if(!window.confirm(`Publicar a resposta “${resposta.arquivo_nome}” para todos os alunos?`))return;
    setErro('');setAviso('');
    try{await instrutorAPI('publicar',codigo,{resposta_id:resposta.id});setAviso('Resposta publicada para todos os alunos.');await atualizar()}
    catch(e){setErro(msg(e))}
  }
  async function excluirResposta(r){
    if(!window.confirm(`Excluir definitivamente a resposta “${r.arquivo_nome}”? Esta ação não poderá ser desfeita.`))return;
    setDeletando(r.id);setErro('');setAviso('');
    try{
      const result=await instrutorAPI('excluir-resposta',codigo,{resposta_id:r.id});
      await atualizar();
      if(result.arquivos_pendentes?.length)
        setErro('Resposta excluída do portal, mas houve falha ao remover um ou mais arquivos do armazenamento. Consulte os logs da função e faça a limpeza pendente.');
      else setAviso('Resposta excluída definitivamente.');
    }catch(e){setErro(msg(e))}finally{setDeletando('')}
  }
  async function excluirPedido(p){
    const total=(porPedido[p.id]||[]).length+(rascunhosPorPedido[p.id]||[]).length;
    if(!window.confirm(`Excluir definitivamente o pedido “${p.titulo}” e suas ${total} resposta(s) vinculada(s)? Esta ação não poderá ser desfeita.`))return;
    setDeletando(p.id);setErro('');setAviso('');
    try{
      const result=await instrutorAPI('excluir-pedido',codigo,{pedido_id:p.id});
      await atualizar();
      if(result.arquivos_pendentes?.length)
        setErro('Pedido excluído do portal, mas houve falha ao remover um ou mais arquivos do armazenamento. Consulte os logs da função e faça a limpeza pendente.');
      else setAviso('Pedido e suas respostas excluídos definitivamente.');
    }catch(e){setErro(msg(e))}finally{setDeletando('')}
  }
  function iniciarRecado(r=null){
    setEditandoRecado(r?.id||'novo');
    setRecadoForm(r?{titulo:r.titulo,conteudo:r.conteudo,autor:r.autor,importante:r.importante}:{titulo:'',conteudo:'',autor:'',importante:false});
    setErro('');setAviso('');
  }
  async function salvarRecado(e){
    e.preventDefault();setEnviando(true);setErro('');setAviso('');
    try{
      const payload={titulo:recadoForm.titulo.trim(),conteudo:recadoForm.conteudo.trim(),autor:recadoForm.autor.trim(),importante:recadoForm.importante};
      if(!payload.titulo||!payload.conteudo||!payload.autor)throw new Error('Preencha título, mensagem e nome do instrutor.');
      await instrutorAPI(editandoRecado==='novo'?'criar-recado':'editar-recado',codigo,{
        ...payload,...(editandoRecado!=='novo'?{recado_id:editandoRecado}:{})
      });
      setEditandoRecado(null);setAviso('Recado salvo e disponível para os alunos.');await carregarPublicos();
    }catch(e){setErro(msg(e));}finally{setEnviando(false)}
  }
  async function excluirRecado(r){
    if(!window.confirm(`Excluir o recado “${r.titulo}”?`))return;
    setDeletando(r.id);setErro('');setAviso('');
    try{await instrutorAPI('excluir-recado',codigo,{recado_id:r.id});setAviso('Recado excluído.');await carregarPublicos()}
    catch(e){setErro(msg(e))}finally{setDeletando('')}
  }
  async function baixar(id,fn){setBaixando(id);setErro('');try{await fn()}catch(e){setErro(msg(e))}finally{setBaixando('')}}
  return <>
    <header className="topbar"><div className="header-inner">
      <img className="brasao" src="/brasao-cicm.jpg" alt="Brasão CICM"/>
      <div><div className="eyebrow">CURSO DE INVESTIGAÇÃO CRIMINAL MILITAR</div><h1>Portal CICM</h1><p>{instrutor?'Gestão de respostas e recados · Instrutores':'Arquivos, comunicados e orientações do curso'}</p></div>
    </div></header>
    <main className="container">
      <div className="welcome"><div><h2>{instrutor?'Área do instrutor':aba==='recados'?'Mural de recados':'Arquivos do curso'}</h2>
        <p>{instrutor?'Gerencie os arquivos e publique comunicados para os alunos.':'Consulte os documentos e avisos publicados pelos instrutores.'}</p></div>
        <div className="controls"><button className="light" disabled={carregando} onClick={atualizar}><RefreshCw size={16}/> Atualizar</button>
        {!instrutor&&<button className="primary" onClick={()=>{setAba('enviar');setErro('')}}><Upload size={17}/> Enviar arquivo</button>}
        </div></div>
      {!configured&&<div className="alert warning"><AlertTriangle size={18}/> Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.</div>}
      {erro&&<div className="alert error" role="alert"><AlertTriangle size={18}/>{erro}<button className="close" onClick={()=>setErro('')}><X size={16}/></button></div>}
      {aviso&&<div className="alert success" role="status"><CheckCircle2 size={18}/>{aviso}<button className="close" onClick={()=>setAviso('')}><X size={16}/></button></div>}
      {instrutor&&!autorizado ? <section className="panel access"><LockKeyhole size={32}/><h3>Acesso dos instrutores</h3>
        <p>Endereço não divulgado no portal. Informe o código compartilhado, sem necessidade de conta individual.</p>
        <form className="form" onSubmit={entrar}><label>Código do instrutor<input type="password" autoComplete="off" value={codigo} onChange={e=>setCodigo(e.target.value)} required placeholder="Código de acesso"/></label>
          <button className="primary" disabled={carregando||!configured}><ShieldCheck size={16}/> {carregando?'Validando...':'Acessar painel'}</button></form></section>
      : <>
        <div className="stats"><div><strong>{pedidos.length}</strong><span>Pedidos e relatórios</span></div>
          <div><strong>{respondidos}</strong><span>Com resposta publicada</span></div>
          <div><strong>{pedidos.length-respondidos}</strong><span>Aguardando publicação</span></div></div>
        {instrutor&&<div className="instructor-banner"><EyeOff size={18}/><span>Área não listada no menu dos alunos. As respostas em rascunho só ficam disponíveis mediante código.</span><button className="light" onClick={()=>{setAutorizado(false);setCodigo('');setRascunhos([])}}>Sair</button></div>}
        {<div className="tabs"><button className={aba==='arquivos'?'selected':''} onClick={()=>setAba('arquivos')}><FolderOpen size={17}/> Todos os arquivos</button>{!instrutor&&<button className={aba==='enviar'?'selected':''} onClick={()=>setAba('enviar')}><Upload size={17}/> Novo envio</button>}<button className={aba==='recados'?'selected':''} onClick={()=>setAba('recados')}><Megaphone size={17}/> Mural de recados ({recados.length})</button></div>}
        {aba==='recados'?<section className="recados-area"><div className="recados-heading"><div><h3>Comunicados do curso</h3><p>Orientações e avisos publicados pelos instrutores para toda a turma.</p></div>{instrutor&&<button className="primary" onClick={()=>iniciarRecado()}><Megaphone size={16}/> Novo recado</button>}</div>{!recados.length?<div className="empty"><Megaphone size={35}/><h3>{carregando?'Carregando...':'Nenhum recado publicado'}</h3></div>:<div className="items">{recados.map(r=><article className={'item recado '+(r.importante?'recado-importante':'')} key={r.id}><div className="item-head">{r.importante?<span className="category"><Pin size={14}/> Aviso importante</span>:<span className="category">Comunicado</span>}<span className="recado-data">{dataBR(r.criado_em)}</span></div><h3>{r.titulo}</h3><p className="recado-texto">{r.conteudo}</p><div className="recado-rodape"><span>Publicado por {r.autor}</span>{instrutor&&<div className="actions"><button className="outline" disabled={!!deletando} onClick={()=>iniciarRecado(r)}><Pencil size={15}/> Editar</button><button className="danger-link" disabled={!!deletando} onClick={()=>excluirRecado(r)}><Trash2 size={15}/> Excluir</button></div>}</div></article>)}</div>}</section>:!instrutor&&aba==='enviar'?<section className="panel"><div className="panel-title"><h3>Enviar pedido ou relatório</h3><p>O pedido ficará público para toda a turma.</p></div>
          <form className="form" onSubmit={novoPedido}><div className="cols"><label>Nome do aluno<input maxLength="120" required value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Nome completo"/></label>
            <label>Equipe<input maxLength="100" required value={form.equipe} onChange={e=>setForm({...form,equipe:e.target.value})} placeholder="Ex.: Equipe Alfa"/></label></div>
            <label>Categoria<select value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>Título<input maxLength="180" required value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Ex.: Pedido 001 – Dados cadastrais"/></label>
            <label>Arquivo (até 15 MB)<input type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" onChange={e=>setForm({...form,arquivo:e.target.files?.[0]||null})}/></label>
            <div className="actions"><button className="light" type="button" onClick={()=>setAba('arquivos')}><ArrowLeft size={16}/> Voltar</button>
            <button className="primary" disabled={enviando||!configured} type="submit"><Send size={16}/>{enviando?'Enviando...':'Publicar pedido'}</button></div></form></section>
        : <>
          <div className="filters"><div className="search"><Search size={19}/><input aria-label="Pesquisar arquivos" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por pedido, aluno ou equipe..."/></div>
          <select value={filtro} onChange={e=>setFiltro(e.target.value)} aria-label="Filtrar categoria"><option>Todos</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
          {visiveis.length===0?<div className="empty"><FolderOpen size={35}/><h3>{carregando?'Carregando...':'Nenhum documento encontrado'}</h3></div>
          :<div className="items">{visiveis.map(p=>{
            const publicadas=porPedido[p.id]||[],pendentes=instrutor?(rascunhosPorPedido[p.id]||[]):[];
            return <article className="item" key={p.id}><div className="item-head"><span className="category">{p.categoria}</span>
              <span className={'status '+(publicadas.length?'done':'pending')}>{publicadas.length?<><CheckCircle2 size={14}/> Respondido</>:<><Clock3 size={14}/> Aguardando resposta</>}</span></div>
              <h3>{p.titulo}</h3><div className="meta"><span><Users size={14}/>{p.equipe}</span><span>Enviado por {p.nome}</span><span>{dataBR(p.criado_em)}</span></div>
              <div className="attachment"><FileText size={19}/><span title={p.arquivo_nome}>{p.arquivo_nome}</span>
              <button disabled={baixando===p.id} onClick={()=>baixar(p.id,()=>baixarPedido(p.arquivo_path,p.arquivo_nome))}><Download size={16}/> Baixar pedido</button></div>
              {!!publicadas.length&&<div className="replies"><h4>Respostas publicadas ({publicadas.length})</h4>{publicadas.map(r=><div className="reply" key={r.id}>
                <div><CheckCircle2 size={17}/><span title={r.arquivo_nome}>{r.arquivo_nome}</span><small>por {r.nome} · {dataBR(r.criado_em)}</small></div>
                <button disabled={baixando===r.id} onClick={()=>baixar(r.id,()=>baixarResposta(r,instrutor?codigo:''))}><Download size={16}/> Baixar</button>{instrutor&&<button className="danger-link" disabled={!!deletando} onClick={()=>excluirResposta(r)}><Trash2 size={16}/> Excluir</button>}</div>)}</div>}
              {!!pendentes.length&&<div className="replies drafts"><h4><Eye size={16}/> Rascunhos — visíveis somente ao instrutor ({pendentes.length})</h4>{pendentes.map(r=><div className="reply" key={r.id}>
                <div><Clock3 size={17}/><span>{r.arquivo_nome}</span><small>{r.nome} · {dataBR(r.criado_em)}</small></div>
                <div className="draft-actions"><button onClick={()=>baixar(r.id,()=>baixarResposta(r,codigo))}><Download size={16}/> Baixar</button>
                <button className="primary" disabled={!!deletando} onClick={()=>publicar(r)}><Send size={16}/> Publicar</button><button className="danger-link" disabled={!!deletando} onClick={()=>excluirResposta(r)}><Trash2 size={16}/> Excluir</button></div></div>)}</div>}
              {instrutor&&<div className="item-footer"><button className="danger-button" disabled={!!deletando} onClick={()=>excluirPedido(p)}><Trash2 size={16}/> Excluir pedido e respostas</button><button className="outline" disabled={!!deletando} onClick={()=>{setRespostaPara(p);setErro('')}}><Upload size={16}/> Anexar resposta em rascunho</button></div>}
            </article>
          })}</div>}
        </>}
      </>}
      <footer><Mail size={16}/> Aviso de novos pedidos por e-mail configurável no Supabase. <span>Use somente documentos fictícios ou liberados para compartilhamento público.</span></footer>
    </main>
    {editandoRecado&&<div className="modal-backdrop" onClick={()=>{if(!enviando)setEditandoRecado(null)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-recado" onClick={e=>e.stopPropagation()}><div className="modal-top"><h3 id="titulo-recado">{editandoRecado==='novo'?'Novo recado':'Editar recado'}</h3><button className="icon-btn" disabled={enviando} onClick={()=>setEditandoRecado(null)}><X size={20}/></button></div><p>Este recado ficará visível a todos os alunos do portal.</p><form className="form" onSubmit={salvarRecado}><label>Título<input required maxLength={180} value={recadoForm.titulo} onChange={e=>setRecadoForm({...recadoForm,titulo:e.target.value})}/></label><label>Nome do instrutor<input required maxLength={120} value={recadoForm.autor} onChange={e=>setRecadoForm({...recadoForm,autor:e.target.value})}/></label><label>Mensagem<textarea required maxLength={5000} rows={7} value={recadoForm.conteudo} onChange={e=>setRecadoForm({...recadoForm,conteudo:e.target.value})}/></label><label className="recado-check"><input type="checkbox" checked={recadoForm.importante} onChange={e=>setRecadoForm({...recadoForm,importante:e.target.checked})}/> Destacar como aviso importante</label><div className="actions"><button className="light" type="button" disabled={enviando} onClick={()=>setEditandoRecado(null)}>Cancelar</button><button className="primary" disabled={enviando} type="submit"><Send size={16}/>{enviando?'Salvando...':'Publicar recado'}</button></div></form></section></div>}
    {respostaPara&&<div className="modal-backdrop" onClick={()=>{if(!enviando)setRespostaPara(null)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-resposta" onClick={e=>e.stopPropagation()}>
      <div className="modal-top"><h3 id="titulo-resposta">Nova resposta em rascunho</h3><button className="icon-btn" disabled={enviando} onClick={()=>setRespostaPara(null)}><X size={20}/></button></div>
      <p>Pedido: <strong>{respostaPara.titulo}</strong></p><div className="alert warning"><EyeOff size={17}/> Esta resposta não ficará visível aos alunos até clicar em Publicar.</div>
      <form className="form" onSubmit={criarRascunho}><label>Nome do instrutor<input maxLength="120" required value={nomeResp} onChange={e=>setNomeResp(e.target.value)} placeholder="Nome"/></label>
      <label>Arquivo da resposta<input type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" onChange={e=>setArquivoResp(e.target.files?.[0]||null)}/></label>
      <div className="actions"><button type="button" className="light" onClick={()=>setRespostaPara(null)}>Cancelar</button><button className="primary" disabled={enviando}><Upload size={16}/>{enviando?'Enviando...':'Salvar rascunho'}</button></div></form></section></div>}
  </>;
}

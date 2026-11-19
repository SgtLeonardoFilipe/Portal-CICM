-- PORTAL CICM — habilitar exclusão exclusiva para instrutores.
-- Execute depois de migracao_areas.sql. Não apaga dados ao ser executado.
-- Exclui registros de forma transacional e devolve caminhos para limpeza do Storage.
-- As funções são SECURITY INVOKER e só podem ser chamadas pelo service_role.

create or replace function public.cicm_excluir_resposta(p_resposta_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_arquivo text;
begin
  delete from public.cicm_portal_respostas
    where id = p_resposta_id
    returning arquivo_path into v_arquivo;
  if v_arquivo is null then
    raise exception 'Resposta não encontrada';
  end if;
  return jsonb_build_object('arquivo_path',v_arquivo);
end;
$$;

create or replace function public.cicm_excluir_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_arquivo text;
  v_respostas jsonb;
begin
  -- Bloqueia remoção concorrente do mesmo pedido enquanto a transação executa.
  select arquivo_path into v_arquivo
    from public.cicm_portal_pedidos
    where id=p_pedido_id for update;
  if v_arquivo is null then
    raise exception 'Pedido não encontrado';
  end if;

  with removidas as (
    delete from public.cicm_portal_respostas
      where pedido_id=p_pedido_id
      returning arquivo_path
  )
  select coalesce(jsonb_agg(arquivo_path),'[]'::jsonb)
    into v_respostas from removidas;

  delete from public.cicm_portal_pedidos where id=p_pedido_id;
  return jsonb_build_object('pedido_path',v_arquivo,'resposta_paths',v_respostas);
end;
$$;

revoke all on function public.cicm_excluir_resposta(uuid) from public, anon, authenticated;
revoke all on function public.cicm_excluir_pedido(uuid) from public, anon, authenticated;
grant execute on function public.cicm_excluir_resposta(uuid) to service_role;
grant execute on function public.cicm_excluir_pedido(uuid) to service_role;

-- O aplicativo público não pode excluir registros diretamente.
revoke update, delete on public.cicm_portal_pedidos from anon, authenticated;
revoke update, delete on public.cicm_portal_respostas from anon, authenticated;

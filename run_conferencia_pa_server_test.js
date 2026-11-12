const {
  analisarTripla,
  contagensOrdenadas,
  prepararFinalizacao,
} = require('./functions/conferencia_pa');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function expectError(fn, trecho) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  if (!err || !String(err.message).includes(trecho)) {
    throw new Error('Esperava erro contendo "' + trecho + '", recebeu: ' + (err && err.message));
  }
}

function palete(numero, qtd, enderecoKey) {
  return {
    numero,
    caixasFechadas: Math.floor(qtd / 48),
    unidadesPorCaixa: 48,
    unidadesCaixaParcial: qtd % 48,
    qtdUnidades: qtd,
    enderecoKey,
  };
}

const op = {
  status: 'Concluído', sku: 'PA-001', lote: '26247/06',
  produto: 'Produto teste', produzidoLinha: 1000,
};
const enderecos = { A1:{ codigo:'GAL-A1', ativo:true }, A2:{ codigo:'GAL-A2', ativo:true }, X:{ codigo:'X', ativo:false } };
const agora = '2026-09-10T18:00:00.000Z';
const base = { opKey:'26247-06', op, enderecos, lotesItem:{}, autor:'Logística Teste', agora };

const exata = {
  qtdApontada:1000,
  contagens:{ c1:{ total:1000, contadoEm:'2026-09-10T17:00:00.000Z', paletes:{ p1:palete(1,500,'A1'), p2:palete(2,500,'A2') } } },
};
const planoExato = prepararFinalizacao({ ...base, conf:exata, conciliacao:null });
assert(planoExato.total === 1000 && planoExato.diferenca === 0, 'Finalização exata calculada errado');
assert(planoExato.updates['conferencias_pa/26247-06/status'] === 'CONFERIDO', 'Status exato não ficou CONFERIDO');
const lotes = Object.keys(planoExato.updates).filter(k => k.startsWith('estoque_lotes/'));
assert(lotes.length === 2, 'Não criou exatamente dois paletes');
assert(lotes.every(k => planoExato.updates[k].status === 'QUARENTENA'), 'PA não entrou em quarentena');
assert(new Set(lotes.map(k => planoExato.updates[k].identificadorPalete)).size === 2, 'Identificador físico de palete duplicado');

const divergente = {
  qtdApontada:1000,
  alarmeAbertoEm:'2026-09-10T17:00:00.000Z',
  contagens:{
    c1:{total:990, contadoEm:'2026-09-10T17:00:00.000Z', paletes:{p1:palete(1,990,'A1')}},
    c2:{total:990, contadoEm:'2026-09-10T17:10:00.000Z', paletes:{p1:palete(1,990,'A1')}},
    c3:{total:1000, contadoEm:'2026-09-10T17:20:00.000Z', paletes:{p1:palete(1,1000,'A1')}},
  },
};
expectError(() => prepararFinalizacao({ ...base, conf:divergente, conciliacao:null }), 'causa e explicação');
const conciliacao = { motivo:'PERDA_OU_AVARIA', observacao:'Dez unidades avariadas confirmadas nas recontagens.' };
const planoDiv = prepararFinalizacao({ ...base, conf:divergente, conciliacao });
assert(planoDiv.diferenca === -10 && planoDiv.rncNumero === 'RNC-PA-26247-06', 'Divergência/RNC incorreta');
assert(planoDiv.updates['nao_conformidades/RNC-PA-26247-06'].qtdEnvolvida === 10, 'RNC não preservou quantidade envolvida');
assert(planoDiv.updates['conferencias_pa/26247-06/status'] === 'CONFERIDO_COM_DIVERGENCIA', 'Conciliação não preservou divergência');

/* A chave da RNC automática é derivada da OP, então refinalizar a MESMA OP cai
   na MESMA chave -- e isto é um update multipath, não transaction. Sem o guarda,
   a segunda passada zerava a RNC para ABERTA e apagava a causa raiz e a ação
   corretiva de quem já a tinha tratado. O vínculo continua sendo escrito. */
const rncJaTratada = { numero:'RNC-PA-26247-06', status:'CONCLUIDA', causaRaiz:'Avaria no transporte interno',
  acaoCorretiva:'Reforço do filme nos paletes', disposicao:'DESCARTE' };
const planoRetratado = prepararFinalizacao({ ...base, conf:divergente, conciliacao, rncExistente:rncJaTratada });
assert(planoRetratado.rncNumero === 'RNC-PA-26247-06', 'Refinalização perdeu o vínculo com a RNC');
assert(planoRetratado.updates['conferencias_pa/26247-06/rncNumero'] === 'RNC-PA-26247-06', 'Vínculo da conferência não foi reescrito');
assert(!('nao_conformidades/RNC-PA-26247-06' in planoRetratado.updates), 'Refinalização sobrescreveu uma RNC já tratada');

expectError(() => prepararFinalizacao({ ...base, op:{...op, status:'Aguardando Confirmação'}, conf:exata }), 'definitivamente concluída');
/* Apontamento corrigido DEPOIS das contagens (caso real: OP 26265/01, 581 -> 570,
   presa 7 semanas). A recusa antiga mandava "reiniciar com o PCP", caminho que
   nunca existiu na tela: beco sem saída. As contagens são fato físico e valem;
   o servidor usa o apontamento atual SE é o mesmo número que a tela mostrou a
   quem finaliza, e grava o valor do início para a mudança ficar rastreável. */
const opCorrigida = {...op, produzidoLinha:990};
expectError(() => prepararFinalizacao({ ...base, op:opCorrigida, conf:divergente, conciliacao }), 'Atualize a tela');
expectError(() => prepararFinalizacao({ ...base, op:opCorrigida, conf:divergente, conciliacao, qtdApontadaVista:1000 }), 'Atualize a tela');
const planoCorrigido = prepararFinalizacao({ ...base, op:opCorrigida, conf:divergente, conciliacao, qtdApontadaVista:990 });
assert(planoCorrigido.diferenca === 0, 'Diferença não usou o apontamento atual: ' + planoCorrigido.diferenca);
assert(planoCorrigido.total === 990, 'Consenso físico mudou com o apontamento');
assert(planoCorrigido.updates['conferencias_pa/26247-06/qtdApontada'] === 990, 'Conferência não gravou o apontamento atual');
assert(planoCorrigido.updates['conferencias_pa/26247-06/qtdApontadaNoInicio'] === 1000, 'Perdeu o apontamento do início');
const loteCorrigido = Object.keys(planoCorrigido.updates).find(k => k.startsWith('estoque_lotes/'));
assert(planoCorrigido.updates[loteCorrigido].conferencia.qtdApontadaNoInicio === 1000, 'Palete não registra o apontamento do início');
assert(/1\.?000.*990/.test(planoCorrigido.updates['conferencias_pa/26247-06/conciliacao'].observacao), 'Conciliação não registra a mudança do apontamento');
// Apontamento inalterado: nada novo é exigido nem gravado (telas antigas em cache seguem funcionando).
assert(!('conferencias_pa/26247-06/qtdApontadaNoInicio' in planoExato.updates), 'Gravou início sem mudança');
const enderecoInativo = JSON.parse(JSON.stringify(exata));
enderecoInativo.contagens.c1.paletes.p1.enderecoKey = 'X';
expectError(() => prepararFinalizacao({ ...base, conf:enderecoInativo }), 'inativo');
expectError(() => prepararFinalizacao({ ...base, conf:exata, lotesItem:{ legado:{opKey:'26247-06', status:'QUARENTENA'} } }), 'evitar duplicidade');

const retry = prepararFinalizacao({
  ...base,
  conf:exata,
  lotesItem:Object.fromEntries(lotes.map(k => {
    const key = k.split('/').pop();
    return [key, planoExato.updates[k]];
  })),
});
assert(JSON.stringify(Object.keys(retry.updates).sort()) === JSON.stringify(Object.keys(planoExato.updates).sort()), 'Retry mudou os caminhos determinísticos');

const empate = { contagens:{ b:{total:999,contadoEm:agora}, a:{total:1000,contadoEm:agora}, c:{total:1000,contadoEm:'2026-09-10T18:01:00.000Z'} } };
const ordenadas = contagensOrdenadas(empate);
assert(ordenadas[0].key === 'a' && ordenadas[1].key === 'b', 'Timestamp empatado não teve desempate determinístico');
assert(analisarTripla(1000, ordenadas).status === 'PRONTO_CONCILIADO', 'Consenso do servidor divergiu da tela');

console.log('OK servidor PA: OP final; endereços ativos; legado bloqueado; RNC automática; paths idempotentes; quarentena preservada.');

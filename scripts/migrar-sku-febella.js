'use strict';

const fs = require('node:fs');

const arquivo = process.argv[2];
const modo = process.argv[3] || '--summary';
if (!arquivo) throw new Error('Uso: node scripts/migrar-sku-febella.js <backup.json> [--summary|--json|--out=arquivo.json]');
const base = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

const mapa = {
  'HIG-FEBELLABEAUTY-0001': 'FBMF0003',
  'PEL-FEBELLABEAUTY-0001': 'FBHD0003',
  'PEL-FEBELLABEAUTY-0002': 'FBHD0004',
  'PEL-FEBELLABEAUTY-0003': 'FBHD0005',
  'PEL-FEBELLABEAUTY-0004': 'FBHD0006',
  'PEL-FEBELLABEAUTY-0005': 'FBHD0007',
  'PEL-FEBELLABEAUTY-0006': 'FBHD0008',
  'PRF-FEBELLABEAUTY-0002': 'FBBS0007',
};
const ignorarRaiz = new Set(['auditoria_geral', 'eventos_auditoria', 'pendencias_setor', 'backups', 'migracoes', 'sku_historico', 'produtos']);
const updates = {};
const alteracoesPorRaiz = {};

function trocarTexto(valor) {
  let saida = valor;
  for (const [antigo, novo] of Object.entries(mapa)) saida = saida.split(antigo).join(novo);
  return saida;
}

function clonarTransformado(valor) {
  if (typeof valor === 'string') return trocarTexto(valor);
  if (Array.isArray(valor)) return valor.map(clonarTransformado);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.entries(valor).map(([chave, filho]) => [trocarTexto(chave), clonarTransformado(filho)]));
}

function registrar(caminho, valor) {
  if (Object.prototype.hasOwnProperty.call(updates, caminho) && JSON.stringify(updates[caminho]) !== JSON.stringify(valor)) {
    throw new Error(`Colisão de atualização em ${caminho}`);
  }
  updates[caminho] = valor;
  const raiz = caminho.split('/')[0];
  alteracoesPorRaiz[raiz] = (alteracoesPorRaiz[raiz] || 0) + 1;
}

function andar(valor, partes) {
  if (typeof valor === 'string') {
    const novo = trocarTexto(valor);
    if (novo !== valor) registrar(partes.join('/'), novo);
    return;
  }
  if (!valor || typeof valor !== 'object') return;
  for (const [chave, filho] of Object.entries(valor)) {
    const novaChave = trocarTexto(chave);
    if (novaChave !== chave) {
      const destino = [...partes, novaChave].join('/');
      let existente = base;
      for (const parte of [...partes, novaChave]) existente = existente?.[parte];
      if (existente != null) throw new Error(`Destino já existe: ${destino}`);
      registrar(destino, clonarTransformado(filho));
      registrar([...partes, chave].join('/'), null);
    } else andar(filho, [...partes, chave]);
  }
}

if (modo === '--verify') {
  const problemas = [];
  for (const [antigo, novo] of Object.entries(mapa)) {
    if (base.produtos?.[antigo]) problemas.push(`produto antigo ainda existe: ${antigo}`);
    if (!base.produtos?.[novo] || base.produtos[novo].sku !== novo) problemas.push(`produto novo ausente/inválido: ${novo}`);
    if (base.sku_historico?.[antigo] !== novo) problemas.push(`alias incorreto: ${antigo} -> ${base.sku_historico?.[antigo] || 'ausente'}`);
  }
  function procurarAntigos(valor, partes) {
    if (typeof valor === 'string') {
      for (const antigo of Object.keys(mapa)) if (valor.includes(antigo)) problemas.push(`${partes.join('/')}: valor antigo ${antigo}`);
      return;
    }
    if (!valor || typeof valor !== 'object') return;
    for (const [chave, filho] of Object.entries(valor)) {
      for (const antigo of Object.keys(mapa)) if (chave.includes(antigo)) problemas.push(`${partes.join('/')}: chave antiga ${antigo}`);
      procurarAntigos(filho, [...partes, chave]);
    }
  }
  for (const [raiz, valor] of Object.entries(base)) if (!ignorarRaiz.has(raiz)) procurarAntigos(valor, [raiz]);
  if (base.clientes?.FEBELLABEAUTY?.cnpj !== '26.747.489/0001-53') problemas.push('CNPJ da Febella não foi gravado no cliente mestre');
  process.stdout.write(`${JSON.stringify({ ok: problemas.length === 0, problemas }, null, 2)}\n`);
  process.exit(problemas.length ? 1 : 0);
}

for (const [raiz, valor] of Object.entries(base)) if (!ignorarRaiz.has(raiz)) andar(valor, [raiz]);

// O produto novo guarda a cadeia de nomes e o cliente passa a ter o CNPJ que
// confirmou a identidade no cadastro de fornecedores.
for (const [antigo, novo] of Object.entries(mapa)) {
  const produto = base.produtos?.[antigo];
  if (!produto) throw new Error(`Produto de origem ausente: ${antigo}`);
  const anteriores = { ...(produto.skusAnteriores || {}), [antigo]: true };
  registrar(`produtos/${novo}`, { ...clonarTransformado(produto), sku: novo, skusAnteriores: anteriores,
    migradoEm: '2026-11-06T00:00:00-03:00', migradoMotivo: 'Padrao original Febella confirmado por CNPJ' });
  registrar(`produtos/${antigo}`, null);
}
registrar('clientes/FEBELLABEAUTY/cnpj', '26.747.489/0001-53');
for (const [id, cliente] of Object.entries(base.erp?.kuryos?.crm_clients || {})) {
  if (cliente?.cadastro_cliente_id === 'FEBELLABEAUTY' || String(cliente?.nome_empresa || '').toUpperCase().includes('FEBELLA')) {
    registrar(`erp/kuryos/crm_clients/${id}/cnpj`, '26.747.489/0001-53');
  }
}

for (const [antigo, novo] of Object.entries(mapa)) registrar(`sku_historico/${antigo}`, novo);
registrar('sku_historico/FEBS0005', 'FBBS0005');
registrar('sku_historico/PRF-FEBELLABEAUTY-0001', 'FBBS0005');
registrar('sku_historico/PRF-FEBELLABEAUTY-0010', 'FBBS0005');
registrar('sku_historico/FBBS0005', null);
registrar('produtos/PRF-FEBELLABEAUTY-0010', null);

if (modo.startsWith('--out=')) {
  const destino = modo.slice('--out='.length);
  if (!destino) throw new Error('Informe o arquivo de saída após --out=.');
  fs.writeFileSync(destino, JSON.stringify(updates));
  process.stdout.write(`${destino}: ${Object.keys(updates).length} atualizações\n`);
} else if (modo === '--json') process.stdout.write(JSON.stringify(updates));
else process.stdout.write(`${JSON.stringify({ mapeamentos: mapa, totalAtualizacoes: Object.keys(updates).length, alteracoesPorRaiz }, null, 2)}\n`);

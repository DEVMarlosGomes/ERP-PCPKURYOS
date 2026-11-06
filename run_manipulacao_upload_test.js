'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/manipulacao.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter((source) => source.trim());
scripts.forEach((source) => new Function(source)); // valida a sintaxe do JS embutido

assert.match(html, /setMaxUploadRetryTime\(60000\)/, 'upload não pode repetir silenciosamente por vários minutos');
assert.match(html, /setMaxOperationRetryTime\(20000\)/, 'confirmação da URL também tem limite');
assert.match(html, /1600 \/ maior/, 'foto da balança é redimensionada antes do envio');
assert.match(html, /'image\/jpeg', 0\.78/, 'foto usa compressão JPEG explícita');
assert.match(html, /tarefa\.on\('state_changed'/, 'operador recebe progresso real do upload');
assert.match(html, /Enviando foto ' \+ pct \+ '%'/, 'percentual aparece durante o envio');
assert.match(html, /A foto continua na tela para tentar novamente/, 'timeout preserva o formulário');
assert.match(html, /if \(fp\.uploadConcluido\) return;/, 'retry não reenvia arquivo já concluído');
assert.match(html, /if \(!arquivo \|\| fp\.urlUpload\) return;/, 'retry reaproveita URL já confirmada');
assert.match(html, /if \(!fp\.parcelaRef\).*\.push\(\)/, 'chave da parcela nasce uma única vez');
assert.match(html, /return fp\.parcelaRef\.set\(/, 'retry grava na mesma chave e não duplica pesagem');
assert.match(html, /delete formParcela\.uploadConcluido/, 'refazer a foto invalida o envio anterior');
assert.match(html, /bytesOriginais/, 'auditoria conserva o tamanho recebido do celular');
assert.match(html, /otimizada = arquivo\.size < arquivoOriginal\.size/, 'registro informa quando houve otimização');

console.log('run_manipulacao_upload_test.js: OK (compressão, progresso, timeout e retry idempotente)');

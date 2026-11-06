"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const login = fs.readFileSync("public/login.html", "utf8");
const users = fs.readFileSync("public/usuarios.html", "utf8");
const rules = fs.readFileSync("database.rules.json", "utf8");
const authCheck = fs.readFileSync("public/auth_check.js", "utf8");

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks += 1; };
const validarScriptsInline = (html, arquivo) => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) new vm.Script(match[1], {filename: arquivo});
  }
  checks += 1;
};

validarScriptsInline(login, "public/login.html");
validarScriptsInline(users, "public/usuarios.html");

ok(/sendPasswordResetEmail/.test(login), "login oferece recuperação de senha");
ok(/confirmPasswordReset/.test(login), "login conclui redefinição no próprio ERP");
ok(!/createUserWithEmailAndPassword/.test(login), "login não oferece autocadastro público");
ok(!/form-register|tab-register|handleRegister/.test(login), "superfície pública de cadastro removida");
ok(/auth\/user-disabled/.test(login), "conta desativada recebe mensagem específica");
ok(/pass\.length < 8/.test(login) && /!\/\[a-z\]\//.test(login) && /!\/\[A-Z\]\//.test(login) && /!\/\[0-9\]\//.test(login), "nova senha tem política mínima explícita");
ok(/firebase-functions-compat/.test(users), "gestão usa callable autenticada");
ok(/httpsCallable\('gerenciarUsuario'\)/.test(users), "CRUD aponta para serviço privilegiado");
ok(/acao: 'criar'/.test(users) && /acao: 'atualizar'/.test(users), "criação e edição cobertas");
ok(/id="novoSenha"/.test(users) && /id="novoConfirmarSenha"/.test(users), "cadastro direto exige senha inicial e confirmação");
ok(/nova_senha: senha/.test(users) && /senha temporária/.test(users) && /troca será obrigatória/.test(users), "cadastro aprova login com senha temporária e troca obrigatória");
ok(/Senha temporária definida/.test(users) && /troca será obrigatória/.test(users), "redefinição administrativa exige troca no próximo acesso");
ok(/id="novoUsuario"/.test(users) && /usuario: usuario/.test(users), "cadastro exige identificador de usuário único");
ok(/acao: 'desativar'/.test(users) && /acao: 'funcoes'/.test(users), "desativação e reativação cobertas");
ok(/acao: 'revogar_sessoes'/.test(users), "administrador encerra sessões");
ok(/acao: 'excluir'/.test(users) && /confirmacao_email/.test(users), "exclusão definitiva exige confirmação");
ok(/editTenant/.test(users) && /novoTenant/.test(users), "tenant faz parte do cadastro");
ok(!/createUserWithEmailAndPassword|senhaDescartavel|instanciaCadastro/.test(users), "navegador não cria identidade diretamente");
ok(!/database\.ref\('usuarios\/.*\)\.(?:set|update|remove)/.test(users), "navegador não altera perfil diretamente");
ok(/"auditoria_acessos"[\s\S]*?"\.write": false/.test(rules), "auditoria é somente servidor");
ok(/"usuarios_removidos"[\s\S]*?"\.write": false/.test(rules), "arquivo de excluídos é somente servidor");

const {PASSWORD_POLICY, CLIENT_PERMISSIONS} = require("./scripts/configurar-auth-producao");
const {FUNCOES_VALIDAS, MODULOS_VALIDOS} = require("./functions/identidade_acesso");
ok(PASSWORD_POLICY.enforcementState === "ENFORCE" && PASSWORD_POLICY.constraints.minLength === 8, "backend exige política de senha");
ok(PASSWORD_POLICY.constraints.requireLowercase && PASSWORD_POLICY.constraints.requireUppercase && PASSWORD_POLICY.constraints.requireNumeric, "backend exige maiúscula, minúscula e número");
ok(CLIENT_PERMISSIONS.disabledUserSignup && CLIENT_PERMISSIONS.disabledUserDeletion, "backend bloqueia cadastro e exclusão públicos");

const trechoModulos = authCheck.slice(authCheck.indexOf("const KURYOS_MODULOS ="), authCheck.indexOf("const MODULOS_POR_PAPEL ="));
const modulosDaUi = [...trechoModulos.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((match) => match[1]).sort();
assert.deepEqual([...MODULOS_VALIDOS].sort(), modulosDaUi, "módulos aceitos pelo servidor devem acompanhar auth_check.js");
checks += 1;
const trechoFuncoes = users.slice(users.indexOf("var FUNCOES = ["), users.indexOf("var funcUidAtual"));
const funcoesDaUi = [...trechoFuncoes.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(FUNCOES_VALIDAS, funcoesDaUi, "funções aceitas pelo servidor devem acompanhar usuarios.html");
checks += 1;

console.log(`run_identity_access_ui_test: OK (${checks} contratos)`);

"use strict";

// Decisão de Marlos em 03/11/2026: Qualidade + Engenharia de Produto.
// Configuração de servidor, nunca obtida do payload do navegador.
const INDUSTRIAL_APPROVAL_POLICY = Object.freeze({
  id: "epa-industrial",
  version: 1,
  confirmed: true,
  confirmedOn: "2026-11-03",
  requiredRoles: Object.freeze(["qualidade", "engenharia_produto"])
});

module.exports = {INDUSTRIAL_APPROVAL_POLICY};

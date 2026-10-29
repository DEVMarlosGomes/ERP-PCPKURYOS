/* CRM-04 (29/10/2026): "prazo da amostra só no projeto e auto popular nos campos à frente —
 * editável nos outros modais, mas já populado". O prazo é pedido (obrigatório) na criação do
 * projeto; cada amostra nasce com ele e o selo "do projeto"; quem muda à mão fica "manual" e
 * deixa de acompanhar o projeto. O P&D herda o prazo da amostra (deadline). */

// Amostra nova: herda o prazo do projeto se ainda não tiver um.
export function herdarPrazo(amostra, prazoProjeto) {
  if (!amostra || amostra.prazo_entrega_cliente || !prazoProjeto) return amostra;
  return { ...amostra, prazo_entrega_cliente: prazoProjeto, prazo_origem: "projeto" };
}

// Edição à mão no campo da amostra. Voltar ao valor do projeto volta a acompanhá-lo.
export function editarPrazo(amostra, valor, prazoProjeto) {
  return { ...amostra, prazo_entrega_cliente: valor, prazo_origem: valor && valor === prazoProjeto ? "projeto" : "manual" };
}

// Prazo do projeto mudou no modal: as amostras que seguem o projeto (ou ainda vazias) acompanham;
// as alteradas à mão ficam como estão.
export function propagarPrazoDoProjeto(amostras, prazoProjeto) {
  return (amostras || []).map((a) => (
    a.prazo_origem === "manual" && a.prazo_entrega_cliente ? a
      : { ...a, prazo_entrega_cliente: prazoProjeto || "", prazo_origem: prazoProjeto ? "projeto" : a.prazo_origem }
  ));
}

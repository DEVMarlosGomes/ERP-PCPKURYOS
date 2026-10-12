"use strict";
(globalThis.webpackChunkfrontend = globalThis.webpackChunkfrontend || []).push([
  [9752],
  {
    9752(e, t, a) {
      a.d(t, { A: () => y });
      var r = a(6213),
        i = a(1636),
        o = a(5800),
        s = a(6068),
        n = a(9709);
      const d = {
        categoria_interesse: {
          perfumaria: ["perfume", "body_splash", "colonia"],
          corporal: ["hidratante", "oleo_corporal", "sabonete"],
          capilar: [
            "shampoo",
            "condicionador",
            "mascara_capilar",
            "finalizador",
          ],
          facial: ["serum", "creme_facial", "limpeza_facial", "protetor_solar"],
        },
        canal_origem: [
          "indicacao",
          "instagram",
          "site",
          "evento",
          "prospeccao_ativa",
          "cliente_recorrente",
          "outro",
        ],
        canal_origem_grupos: {
          prospeccao_ativa_digital: [
            "linkedin",
            "instagram",
            "email",
            "whatsapp",
          ],
          indicacao: ["indicacao_cliente", "indicacao_parceiro"],
          inbound_digital: ["site", "instagram", "google"],
          outros: ["evento", "cliente_recorrente", "outro"],
        },
        temperatura_lead: ["quente", "morno", "frio"],
        segmento: [
          "marca_propria",
          "varejo",
          "distribuidor",
          "influenciador",
          "clinica",
          "outro",
        ],
        porte: ["micro", "pequeno", "medio", "grande"],
        cargo_decisor: [
          "socio",
          "diretor",
          "gerente",
          "compras",
          "marketing",
          "outro",
        ],
        ufs: [
          "AC",
          "AL",
          "AP",
          "AM",
          "BA",
          "CE",
          "DF",
          "ES",
          "GO",
          "MA",
          "MT",
          "MS",
          "MG",
          "PA",
          "PB",
          "PR",
          "PE",
          "PI",
          "RJ",
          "RN",
          "RS",
          "RO",
          "RR",
          "SC",
          "SP",
          "SE",
          "TO",
        ],
        project_posicionamento: ["entrada", "massivo", "premium", "luxo"],
        project_tipo_servico: [
          "desenvolvimento_completo",
          "adaptacao_formula",
          "industrializacao",
          "private_label",
        ],
        project_restricoes_tecnicas: [
          "vegano",
          "natural",
          "sem_parabenos",
          "sem_sulfatos",
          "hipoalergenico",
        ],
        sample_tipos: [
          "nova_formula",
          "adaptacao_de_formula",
          "benchmark",
          "ajuste",
        ],
        sample_unidades: ["g", "ml", "un"],
        stage_labels: {
          prospeccao: "Prospec\xe7\xe3o",
          qualificado: "Qualificado",
          projeto_em_discussao: "Projeto em Discuss\xe3o",
          negociacao: "Negocia\xe7\xe3o",
          cliente_fechado: "Cliente Fechado",
          cliente_perdido: "Cliente Perdido",
          amostra_solicitada: "Amostra Solicitada",
          amostra_em_desenvolvimento: "Amostra em Desenvolvimento",
          amostra_enviada: "Amostra Enviada",
          em_negociacao: "Em Negocia\xe7\xe3o",
          pedido_aprovado: "Pedido Aprovado",
          projeto_arquivado: "Projeto Arquivado",
        },
      };
      function c(e, t) {
        const a = new Error(
          "string" === typeof t
            ? t
            : (null === t || void 0 === t ? void 0 : t.message) ||
              "Erro no Firebase",
        );
        return ((a.response = { status: e, data: { detail: t } }), a);
      }
      function u(e) {
        return Array.isArray(e)
          ? e.map(u).filter((e) => void 0 !== e)
          : !e || "object" !== typeof e || e instanceof Date
            ? e
            : Object.fromEntries(
                Object.entries(e)
                  .filter((e) => {
                    let [, t] = e;
                    return void 0 !== t;
                  })
                  .map((e) => {
                    let [t, a] = e;
                    return [t, u(a)];
                  }),
              );
      }
      function l() {
        var e, t;
        return (
          (null === (e = globalThis.crypto) ||
          void 0 === e ||
          null === (t = e.randomUUID) ||
          void 0 === t
            ? void 0
            : t.call(e)) || (0, o.VC)((0, o.KR)(n.mH, "_ids")).key
        );
      }
      function p() {
        return new Date().toISOString();
      }
      function _(e, t) {
        return `erp/${e}/${t}`;
      }
      async function m(e, t) {
        const a = (await (0, o.Jt)((0, o.KR)(n.mH, _(e, t)))).val() || {};
        return Object.entries(a).map((e) => {
          let [t, a] = e;
          return {
            id: (null === a || void 0 === a ? void 0 : a.id) || t,
            ...(a || {}),
          };
        });
      }
      async function f(e, t, a) {
        const r = (await (0, o.Jt)((0, o.KR)(n.mH, `${_(e, t)}/${a}`))).val();
        return r ? { id: r.id || a, ...r } : null;
      }
      async function w(e, t, a, r) {
        const i = u({ ...r, id: a, tenant_id: e });
        return (await (0, o.hZ)((0, o.KR)(n.mH, `${_(e, t)}/${a}`), i), i);
      }
      async function v(e, t, a, r) {
        const i = await f(e, t, a);
        if (!i) throw c(404, "Registro n\xe3o encontrado.");
        return w(e, t, a, { ...i, ...u(r), updated_at: p() });
      }
      async function T(e, t, a) {
        await (0, o.TF)((0, o.KR)(n.mH, `${_(e, t)}/${a}`));
      }
      async function h(e, t, a) {
        return w(e, t, l(), {
          ...a,
          created_at:
            (null === a || void 0 === a ? void 0 : a.created_at) || p(),
          updated_at: p(),
        });
      }
      async function E(e, t, a, r) {
        return (await m(e, t)).filter((e) => e[a] === r);
      }
      function g(e, t, a) {
        if (!t) return !0;
        const r = String(t).toLocaleLowerCase("pt-BR");
        return a.some((t) =>
          String(
            t
              .split(".")
              .reduce(
                (e, t) => (null === e || void 0 === e ? void 0 : e[t]),
                e,
              ) || "",
          )
            .toLocaleLowerCase("pt-BR")
            .includes(r),
        );
      }
      function P(e, t) {
        return {
          data: e,
          status: 200,
          statusText: "OK",
          headers: {},
          config: t,
        };
      }
      function normalizePdCard(e) {
        return {
          ...e,
          numero_completo:
            e.numero_completo || e.amostra_codigo || e.amostra_numero || "",
          produto: e.produto || e.nome_produto || e.titulo || "",
          cliente: e.cliente || e.cliente_nome || "",
          descricao_aplicacao:
            e.descricao_aplicacao || e.projeto_nome || "",
          responsavel_pd: e.responsavel_pd || "",
        };
      }
      const PD_STATUS_TO_CARD = {
          OPEN: "solicitado",
          IN_PROGRESS: "em_desenvolvimento",
          IN_TESTS: "em_testes",
          WAITING_APPROVAL: "aguardando_aprovacao",
          APPROVED: "aprovado",
          REJECTED: "retrabalho_interno",
          COMPLETED: "concluido",
        },
        PD_CARD_TO_STATUS = {
          solicitado: "OPEN",
          em_desenvolvimento: "IN_PROGRESS",
          em_testes: "IN_TESTS",
          aguardando_aprovacao: "WAITING_APPROVAL",
          aprovado: "APPROVED",
          retrabalho_interno: "REJECTED",
          concluido: "COMPLETED",
        },
        PD_STATUS_LABELS = {
          OPEN: "Aberto",
          IN_PROGRESS: "Em Desenvolvimento",
          IN_TESTS: "Em Testes",
          WAITING_APPROVAL: "Aguardando Aprovação",
          APPROVED: "Aprovado",
          REJECTED: "Retrabalho",
          COMPLETED: "Plano Futuro",
        },
        PD_ALLOWED_TRANSITIONS = {
          OPEN: ["IN_PROGRESS"],
          IN_PROGRESS: ["IN_TESTS"],
          IN_TESTS: ["WAITING_APPROVAL"],
          WAITING_APPROVAL: ["APPROVED", "REJECTED"],
          APPROVED: ["COMPLETED"],
          REJECTED: ["IN_PROGRESS"],
          COMPLETED: [],
        },
        PD_BACKWARD_TRANSITIONS = {
          IN_PROGRESS: "OPEN",
          IN_TESTS: "IN_PROGRESS",
          WAITING_APPROVAL: "IN_TESTS",
          APPROVED: "WAITING_APPROVAL",
        },
        PD_STABILITY_CONDITIONS = [
          { code: "ambient", label: "Ambiente", temperature: "25°C", humidity: "60% UR", checkpoints: [1, 2, 7, 30, 60, 90] },
          { code: "oven_45", label: "Estufa 45°C", temperature: "45°C", humidity: "Controlada", checkpoints: [1, 2, 7, 30, 60, 90] },
          { code: "freezer_minus5", label: "Freezer -5°C", temperature: "-5°C", humidity: "N/A", checkpoints: [1, 2, 7, 30, 60, 90] },
          { code: "light_exposure", label: "Exposição a Luz", temperature: "25°C", humidity: "60% UR", checkpoints: [1, 2, 7, 30, 60, 90] },
          { code: "freeze_thaw", label: "Ciclo Freeze/Thaw", temperature: "-5°C ↔ 40°C", humidity: "Cíclico", checkpoints: [1, 2, 7, 15] },
        ],
        PD_STABILITY_PARAMETERS = [
          ["appearance", "Aspecto"], ["color", "Cor"], ["odor", "Odor"],
          ["ph", "pH"], ["viscosity", "Viscosidade"], ["density", "Densidade"],
          ["spreadability", "Espalhabilidade"], ["separation", "Separação de fases"],
          ["precipitation", "Precipitação"], ["microbiology", "Microbiologia"],
          ["package_compatibility", "Compatibilidade com embalagem"], ["mass_variation", "Variação de massa"],
        ].map(([code, label]) => ({ code, label }));
      function pdUserName(e) {
        return e.nome || e.name || e.email || "Usuário Kuryos";
      }
      function pdItemCosts(e, t) {
        const a = Number(e.percentage || 0),
          r = Number(e.price_per_kg || 0),
          i = null == e.price_usd || "" === e.price_usd ? null : Number(e.price_usd),
          o = Number(t || 6),
          s = null == i || Number.isNaN(i) ? r : i * o;
        return {
          cost_brl: Number(((a / 100) * s).toFixed(6)),
          cost_kg_usd: null == i || Number.isNaN(i) ? 0 : i,
          cost_brl_via_cambio: null == i || Number.isNaN(i) ? null : Number(s.toFixed(4)),
        };
      }
      function pdEnrichFormula(e, t) {
        const a = t.map((t) => ({ ...t, ...pdItemCosts(t, e.cotacao_usd) })),
          r = a.reduce((e, t) => e + Number(t.cost_brl || 0), 0),
          i = Number(e.volume || 0),
          o = "mL" === (e.volume_unit || "mL") ? i / 1e3 : i,
          s = r * (o > 0 ? o : 1),
          n = Number(e.indice_perdas || 0);
        return {
          ...e,
          items: a.map((e) => ({
            ...e,
            cost_percentage: r > 0 ? Number(((Number(e.cost_brl || 0) / r) * 100).toFixed(2)) : 0,
          })),
          total_cost_per_kg: Number(r.toFixed(4)),
          custo_unitario: Number(s.toFixed(2)),
          custo_com_perdas: Number((s * (1 + n / 100)).toFixed(2)),
        };
      }
      function pdFormulaCostData(e) {
        if (!e || !e.length) return null;
        const t = [...e].sort((e, t) => Number(t.version || 0) - Number(e.version || 0))[0],
          a = Number(t.total_cost_per_kg || 0),
          r = Number(t.volume || 0),
          i = "mL" === (t.volume_unit || "mL") ? r / 1e3 : r,
          o = a * (i > 0 ? i : 1),
          s = Number(t.indice_perdas || 0);
        return {
          total_cost_per_kg: Number(a.toFixed(4)),
          total_price_sum: Number((t.items || []).reduce((e, t) => e + Number(t.price_per_kg || 0), 0).toFixed(2)),
          custo_unitario: Number(o.toFixed(2)),
          custo_com_perdas: Number((o * (1 + s / 100)).toFixed(2)),
          cotacao_usd: Number(t.cotacao_usd || 6),
          volume: r,
          volume_unit: t.volume_unit || "mL",
          indice_perdas: s,
        };
      }
      function pdCostVersions(e, t) {
        const a = {
            ingredient_cost_auto: Number(t || 0),
            ingredient_cost_manual: 0,
            total: Number(t || 0),
            notes: "",
            status: "rascunho",
            submitted_at: null,
            submitted_by_name: null,
            ...((null === e || void 0 === e ? void 0 : e.v1) || {}),
          },
          r = null === e || void 0 === e ? void 0 : e.v2;
        return {
          v1: a,
          v2: r || null,
          total_final: null === e || void 0 === e ? void 0 : e.total_final,
          updated_at: null === e || void 0 === e ? void 0 : e.updated_at,
          pd_cost_blank: "rascunho" === a.status && !a.submitted_at && !Number(a.ingredient_cost_auto || 0) && !Number(a.ingredient_cost_manual || 0) && !a.notes,
          pd_cost_analysis_required: "rascunho" === a.status && !a.submitted_at && !Number(a.ingredient_cost_auto || 0) && !Number(a.ingredient_cost_manual || 0) && !a.notes,
        };
      }
      function pdFlattenSnapshot(e, t = "", a = {}) {
        if (Array.isArray(e))
          e.forEach((e, r) => pdFlattenSnapshot(e, `${t}[${r}]`, a));
        else if (e && "object" === typeof e)
          Object.keys(e)
            .sort()
            .forEach((r) => pdFlattenSnapshot(e[r], t ? `${t}.${r}` : r, a));
        else t && (a[t] = null == e ? null : e);
        return a;
      }
      function pdSampleBatch(e, t, a) {
        const r = String(e.nome || "").trim(),
          i = String(e.formula_base_id || "").trim(),
          o = Number(e.volume_base_ml || 0),
          s = Number(e.perda_operacional_percent || 0),
          n = Array.isArray(e.variantes) ? e.variantes : [];
        if (!r) throw c(400, "Nome do lote obrigatório.");
        if (!i) throw c(400, "Fórmula base obrigatória.");
        if (!(o > 0)) throw c(400, "volume_base_ml deve ser maior que zero.");
        if (s < 0 || s >= 100) throw c(400, "perda_operacional_percent deve estar entre 0 e 99,9999.");
        if (!n.length) throw c(400, "Adicione ao menos uma amostra derivada.");
        const d = n.map((e, t) => ({ ...e, id: e.id || l(), nome: String(e.nome || `Variante ${t + 1}`).trim(), versao: Math.max(Number(e.versao || 1), 1), overrides: e.overrides || [] })),
          g = d.map((e) => e.nome.toLowerCase());
        if (new Set(g).size !== g.length) throw c(400, "Os nomes das variantes não podem se repetir.");
        const b = Number(null == e.base_total_volume_ml ? o * d.length : e.base_total_volume_ml),
          $ = e.max_derivacoes ? Number(e.max_derivacoes) : null,
          S = Math.floor((b * (1 - s / 100)) / o),
          q = null == $ ? S : Math.min(S, $),
          j = d.length;
        if (!(b > 0) || q <= 0) throw c(400, "A base informada não gera nenhuma derivação útil.");
        if (j > q) throw c(400, `A base suporta no máximo ${q} derivações e foram informadas ${j}.`);
        const O = String(e.status_base || "ativa").toLowerCase(),
          y = String(e.status_qualidade || "aprovada").toLowerCase(),
          R = q - j,
          A = Number((j * o).toFixed(4)),
          C = Number(Math.max(b - A, 0).toFixed(4)),
          x = [];
        "ativa" !== O && x.push(`status_base_${O}`);
        "aprovada" !== y && x.push(`qualidade_${y}`);
        R <= 0 && x.push("capacidade_esgotada");
        C < o && x.push("volume_insuficiente");
        e.validade_base && new Date(`${e.validade_base}T23:59:59`) < new Date() && x.push("validade_expirada");
        return { ...e, id: a || e.id || l(), development_id: t, nome: r, formula_base_id: i, volume_base_ml: o, base_total_volume_ml: b, perda_operacional_percent: s, allowed_change_scopes: e.allowed_change_scopes && e.allowed_change_scopes.length ? e.allowed_change_scopes : ["cor", "ativo", "fragrancia"], base_reference_ingredients: e.base_reference_ingredients && e.base_reference_ingredients.length ? e.base_reference_ingredients : ["base", "veiculo"], status_base: O, status_qualidade: y, variantes: d, derivadas_count: j, capacidade_maxima_derivacoes: q, capacidade_restante_derivacoes: Math.max(R, 0), volume_consumido_ml: A, volume_disponivel_ml: C, bloqueado_para_novas_derivacoes: !!x.length, motivos_bloqueio: x, updated_at: p() };
      }
      async function pdDeleteRequestCascade(e, t) {
        const a = (await m(e, "pd_developments")).filter(
            (e) => e.request_id === t || e.pd_request_id === t,
          ),
          r = new Set(a.map((e) => e.id)),
          i = (await m(e, "pd_formulas")).filter((e) => r.has(e.development_id)),
          o = new Set(i.map((e) => e.id)),
          s = (await m(e, "pd_stability_studies")).filter((e) => e.request_id === t || e.pd_request_id === t || e.pd_card_id === t),
          n = new Set(s.map((e) => e.id)),
          d = (await m(e, "pd_document_versions")).filter((e) => e.request_id === t || e.pd_request_id === t),
          g = new Set(d.map((e) => e.id));
        for (const [a, i] of [
          ["pd_formula_items", (e) => o.has(e.formula_id)],
          ["pd_formula_phases", (e) => o.has(e.formula_id)],
          ["pd_formula_costs", (e) => o.has(e.formula_id)],
          ["pd_formulas", (e) => r.has(e.development_id)],
          ["pd_tests", (e) => r.has(e.development_id)],
          ["pd_samples", (e) => r.has(e.development_id)],
          ["pd_sample_batches", (e) => r.has(e.development_id)],
          ["pd_approvals", (e) => r.has(e.development_id)],
          ["pd_costs", (e) => r.has(e.development_id)],
          ["pd_cost_versions", (e) => r.has(e.development_id)],
          ["pd_documents", (e) => r.has(e.development_id)],
          ["pd_lab_results", (e) => r.has(e.development_id)],
          ["pd_developments", (e) => r.has(e.id)],
          ["pd_request_status_history", (e) => e.request_id === t || e.pd_request_id === t],
          ["pd_pending_items", (e) => e.request_id === t || e.pd_request_id === t],
          ["pd_updates", (e) => e.request_id === t || e.pd_request_id === t],
          ["pd_stability_readings", (e) => n.has(e.study_id)],
          ["pd_stability_studies", (e) => e.request_id === t || e.pd_request_id === t || e.pd_card_id === t],
          ["workflow_tasks", (e) => "pd_document" === e.entity_type && g.has(e.entity_id)],
          ["pd_document_versions", (e) => e.request_id === t || e.pd_request_id === t],
          ["pd_ficha_tecnica", (e) => e.request_id === t || e.pd_request_id === t || r.has(e.development_id)],
          ["pd_cards", (e) => e.pd_request_id === t],
        ])
          for (const r of (await m(e, a)).filter(i)) await T(e, a, r.id);
        await T(e, "pd_requests", t);
      }
      async function pdSyncRequestStatus(e, t, a) {
        const r = PD_STATUS_TO_CARD[a] || "solicitado",
          i = PD_STATUS_LABELS[a] || a,
          o = (await m(e, "pd_cards")).filter((e) => e.pd_request_id === t.id),
          s = new Map();
        for (const i of o) {
          await v(e, "pd_cards", i.id, { status_pd: r, status: a });
          const o = i.amostra_id || i.crm_sample_id,
            n = i.amostra_variacao_id || i.crm_variacao_id;
          o && n && s.set(`${o}:${n}`, { sampleId: o, variationId: n });
        }
        const n = t.crm_sample_id || t.linked_amostra_id,
          d = t.crm_variacao_id || t.linked_variacao_id;
        n && d && s.set(`${n}:${d}`, { sampleId: n, variationId: d });
        for (const { sampleId: t, variationId: a } of s.values()) {
          const o = await f(e, "crm_samples", t);
          if (o && Array.isArray(o.variacoes)) {
            const t = o.variacoes.map((e) =>
              e.id === a
                ? { ...e, status_pd_raw: r, status_pd_label: i, updated_at: p() }
                : e,
            );
            await v(e, "crm_samples", o.id, { variacoes: t });
          }
        }
      }
      async function pdReconcileStatusMirrors(e) {
        const [t, a, r] = await Promise.all([
            m(e, "pd_requests"),
            m(e, "pd_cards"),
            m(e, "crm_samples"),
          ]),
          i = new Map(r.map((e) => [e.id, e]));
        for (const r of t) {
          const t = PD_STATUS_TO_CARD[r.status || "OPEN"] || "solicitado",
            o = PD_STATUS_LABELS[r.status || "OPEN"] || r.status || "Aberto",
            s = a.filter((e) => e.pd_request_id === r.id),
            n = new Map();
          for (const e of s) {
            const t = e.amostra_id || e.crm_sample_id,
              a = e.amostra_variacao_id || e.crm_variacao_id;
            t && a && n.set(`${t}:${a}`, { sampleId: t, variationId: a });
          }
          const d = r.crm_sample_id || r.linked_amostra_id,
            c = r.crm_variacao_id || r.linked_variacao_id;
          d && c && n.set(`${d}:${c}`, { sampleId: d, variationId: c });
          const u = s.some((e) => e.status_pd !== t || e.status !== r.status),
            l = [...n.values()].some(({ sampleId: e, variationId: a }) => {
              const r = i.get(e),
                s = r && Array.isArray(r.variacoes) ? r.variacoes.find((e) => e.id === a) : null;
              return !s || s.status_pd_raw !== t || s.status_pd_label !== o;
            });
          (u || l) && (s.length || n.size) && (await pdSyncRequestStatus(e, r, r.status || "OPEN"));
        }
      }
      async function pdFullDetail(e, t) {
        const a = (await m(e, "pd_developments")).find((e) => e.request_id === t.id || e.pd_request_id === t.id) || null,
          r = null === a || void 0 === a ? void 0 : a.id,
          i = async (t) => (await m(e, t)).filter((e) => e.development_id === r),
          o = r ? await i("pd_formulas") : [],
          s = new Set(o.map((e) => e.id)),
          n = (await m(e, "pd_formula_items")).filter((e) => s.has(e.formula_id)),
          d = o.map((e) => pdEnrichFormula(e, n.filter((t) => t.formula_id === e.id))).sort((e, t) => Number(t.version || 0) - Number(e.version || 0)),
          u = r ? await i("pd_approvals") : [],
          l = (await m(e, "pd_pending_items")).filter((e) => e.request_id === t.id || e.pd_request_id === t.id),
          _ = (await m(e, "pd_request_status_history")).filter((e) => e.request_id === t.id || e.pd_request_id === t.id).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))),
          g = t.crm_sample_id || t.linked_amostra_id ? await f(e, "crm_samples", t.crm_sample_id || t.linked_amostra_id) : null,
          P = g && Array.isArray(g.variacoes) ? g.variacoes.find((e) => e.id === (t.crm_variacao_id || t.linked_variacao_id)) || null : null,
          b = g ? {
            ...g,
            _source: "crm_sample",
            _amostra_id: g.id,
            _variacao_id: null === P || void 0 === P ? void 0 : P.id,
            _variacao_codigo: null === P || void 0 === P ? void 0 : P.codigo,
            nome_cliente: g.cliente_nome || t.client_name || "",
            nome_projeto: g.projeto_nome || t.project_name || "",
            produto: g.produto || g.nome_produto || t.project_name || "",
            observacoes: (null === P || void 0 === P ? void 0 : P.observacoes_especificas) || g.observacao_tecnica || "",
            outras_observacoes: (null === P || void 0 === P ? void 0 : P.observacoes_especificas) || "",
            feedback_cliente: (null === P || void 0 === P ? void 0 : P.feedback_cliente) || g.feedback_cliente || "",
            direcoes_retrabalho: (null === P || void 0 === P ? void 0 : P.direcoes_retrabalho) || g.direcoes_retrabalho || "",
            resultado_cliente: (null === P || void 0 === P ? void 0 : P.resultado_cliente) || (null === P || void 0 === P ? void 0 : P.resultado) || g.resultado || "",
          } : null,
          $ = pdFormulaCostData(d),
          S = r ? (await i("pd_cost_versions"))[0] || null : null,
          q = r ? (await i("pd_lab_results"))[0] || (null === a || void 0 === a ? void 0 : a.lab_results) || null : null;
        return {
          request: g ? { ...t, category: t.category || g.categoria || "", description: t.description || g.briefing_especifico || "", objectives: t.objectives || g.objetivo_projeto || "", references: t.references || g.referencia_formula || "", deadline: t.deadline || g.prazo_entrega_cliente || "" } : t,
          development: a,
          formulas: d,
          tests: r ? (await i("pd_tests")).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))) : [],
          samples: r ? (await i("pd_samples")).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))) : [],
          approvals: u,
          approval: u[0] || null,
          costs: r ? (await i("pd_costs"))[0] || { ingredient_cost: 0, packaging_cost: 0, labor_cost: 0, total_cost: 0 } : { ingredient_cost: 0, packaging_cost: 0, labor_cost: 0, total_cost: 0 },
          documents: r ? (await i("pd_documents")).sort((e, t) => String(t.uploaded_at || t.created_at || "").localeCompare(String(e.uploaded_at || e.created_at || ""))) : [],
          updates: (await m(e, "pd_updates")).filter((e) => e.request_id === t.id || e.pd_request_id === t.id).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))),
          pending_items: l,
          pending: l.map((e) => ({ ...e, status_calc: "pendente" === e.status && e.data_prevista && new Date(e.data_prevista) < new Date() ? "atrasado" : e.status })),
          status_history: _,
          history: _,
          client_info: b,
          formula_cost_data: $,
          cost_versions: pdCostVersions(S, null === $ || void 0 === $ ? void 0 : $.total_cost_per_kg),
          lab_results: q,
          blocking_tasks: [],
        };
      }
      async function b(e, t, a, r, i, o) {
        var s;
        const d = l(),
          c = l(),
          u = l(),
          _ = p(),
          m = await w(e, "pd_requests", d, {
            project_name: t.nome_produto || t.nome_amostra,
            title: t.nome_produto || t.nome_amostra,
            client_id: (null === i || void 0 === i ? void 0 : i.id) || "",
            client_name:
              (null === i || void 0 === i ? void 0 : i.nome_empresa) ||
              t.cliente_nome ||
              "",
            crm_project_id:
              (null === r || void 0 === r ? void 0 : r.id) || t.projeto_id,
            crm_sample_id: t.id,
            crm_variacao_id: a.id,
            category:
              t.categoria ||
              (null === r || void 0 === r ? void 0 : r.categoria) ||
              "",
            description:
              t.briefing_especifico ||
              (null === r || void 0 === r ? void 0 : r.briefing_resumido) ||
              "",
            objectives:
              t.objetivo_projeto ||
              (null === r || void 0 === r ? void 0 : r.ideia_conceito) ||
              "",
            references:
              t.referencia_formula ||
              (null === r || void 0 === r ? void 0 : r.referencia_mercado) ||
              "",
            restrictions: Array.isArray(
              null === r || void 0 === r ? void 0 : r.restricoes_tecnicas,
            )
              ? r.restricoes_tecnicas.join(", ")
              : "",
            deadline:
              t.prazo_entrega_cliente ||
              (null === r || void 0 === r
                ? void 0
                : r.prazo_desejado_amostra) ||
              "",
            status: "OPEN",
            priority: t.prioridade || "Normal",
            request_type: "CLIENT",
            created_by:
              null === (s = n.e7.currentUser) || void 0 === s ? void 0 : s.uid,
            created_by_name: o.nome || o.name || o.email,
            created_at: _,
            updated_at: _,
          });
        await w(e, "pd_developments", c, {
          request_id: d,
          status: "OPEN",
          created_at: _,
          updated_at: _,
        });
        return {
          request: m,
          card: await w(e, "pd_cards", u, {
            pd_request_id: d,
            development_id: c,
            projeto_id:
              (null === r || void 0 === r ? void 0 : r.id) || t.projeto_id,
            amostra_id: t.id,
            amostra_variacao_id: a.id,
            amostra_numero: t.numero_amostra || "",
            amostra_codigo: a.codigo || t.numero_amostra || "",
            numero_completo: a.codigo || t.numero_amostra || "",
            titulo: m.project_name,
            nome_produto: m.project_name,
            produto: m.project_name,
            cliente_nome: m.client_name,
            cliente: m.client_name,
            descricao_aplicacao: a.descricao_aplicacao || "",
            briefing_base: t.briefing_base || t.briefing_especifico || "",
            observacoes_especificas: a.observacoes_especificas || "",
            responsavel_pd: t.responsavel_pd || "",
            prazo_prometido:
              t.prazo_entrega_cliente ||
              (null === r || void 0 === r
                ? void 0
                : r.prazo_desejado_amostra) ||
              "",
            projeto_nome:
              (null === r || void 0 === r ? void 0 : r.nome_projeto) ||
              t.projeto_nome ||
              "",
            status_pd: "solicitado",
            created_at: _,
            updated_at: _,
          }),
        };
      }
      async function $(e, t) {
        var a;
        let r =
            arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {},
          i =
            arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : {};
        const { profile: u, tenantId: _ } = await (async function () {
            const e = n.e7.currentUser;
            if (!e) throw c(401, "Sess\xe3o expirada.");
            const t =
              (await (0, o.Jt)((0, o.KR)(n.mH, `usuarios/${e.uid}`))).val() ||
              {};
            return {
              authUser: e,
              profile: t,
              tenantId: t.tenant_id || "kuryos",
            };
          })(),
          $ = new URL(t, "https://firebase.local"),
          S = $.pathname.replace(/^\/api/, ""),
          q = { ...Object.fromEntries($.searchParams), ...(i.params || {}) },
          j = (e) => S.match(e);
        if ("GET" === e && "/auth/me" === S) return P(u, i);
        if ("GET" === e && ("/crm/users-list" === S || "/users" === S))
          return P(
            await (async function () {
              const e =
                (await (0, o.Jt)((0, o.KR)(n.mH, "usuarios"))).val() || {};
              return Object.entries(e).map((e) => {
                let [t, a] = e;
                return {
                  id: t,
                  uid: t,
                  name: a.name || a.nome || a.email,
                  email: a.email,
                  role: a.role,
                };
              });
            })(),
            i,
          );
        if ("GET" === e && "/crm/constants" === S) return P(d, i);
        if ("GET" === e && "/crm/clients" === S) {
          let e = await m(_, "crm_clients");
          return (
            q.search &&
              (e = e.filter((e) =>
                g(e, q.search, [
                  "nome_empresa",
                  "cnpj",
                  "contato_principal.nome",
                  "contato_principal.email",
                ]),
              )),
            P(
              e.sort((e, t) =>
                String(t.updated_at || t.created_at).localeCompare(
                  String(e.updated_at || e.created_at),
                ),
              ),
              i,
            )
          );
        }
        if ("POST" === e && "/crm/clients" === S) {
          const e = l();
          return P(
            await w(_, "crm_clients", e, {
              ...r,
              stage: "prospeccao",
              created_at: p(),
              updated_at: p(),
              created_by: n.e7.currentUser.uid,
            }),
            i,
          );
        }
        let O = j(/^\/crm\/clients\/([^/]+)\/full$/);
        if ("GET" === e && O) {
          const e = await f(_, "crm_clients", O[1]);
          if (!e) throw c(404, "Cliente n\xe3o encontrado.");
          return P(
            await (async function (e, t) {
              const a = (await m(e, "crm_projects")).filter(
                  (e) => e.cliente_id === t.id,
                ),
                r = new Set(a.map((e) => e.id)),
                i = (await m(e, "crm_samples")).filter((e) =>
                  r.has(e.projeto_id),
                ),
                o = (await m(e, "orders")).filter((e) => e.cliente_id === t.id);
              return {
                client: t,
                projects: a,
                samples: i,
                orders: o,
                summary: {
                  total_projetos: a.length,
                  projetos_ativos: a.filter(
                    (e) =>
                      !["pedido_aprovado", "projeto_arquivado"].includes(
                        e.stage,
                      ),
                  ).length,
                  total_amostras: i.length,
                  item_mais_pedido: "",
                },
              };
            })(_, e),
            i,
          );
        }
        if (((O = j(/^\/crm\/clients\/([^/]+)\/move$/)), "PUT" === e && O)) {
          return P(
            {
              ...(await v(_, "crm_clients", O[1], {
                stage: r.stage,
                motivo_perda: r.motivo_perda,
                justificativa: r.justificativa,
              })),
              to_stage: r.stage,
            },
            i,
          );
        }
        if (((O = j(/^\/crm\/clients\/([^/]+)$/)), O && "GET" === e))
          return P(await f(_, "crm_clients", O[1]), i);
        if (O && "PUT" === e) return P(await v(_, "crm_clients", O[1], r), i);
        if ("GET" === e && "/crm/projects" === S) {
          let e = await m(_, "crm_projects");
          return (
            q.search &&
              (e = e.filter((e) =>
                g(e, q.search, [
                  "nome_projeto",
                  "cliente_nome",
                  "ideia_conceito",
                ]),
              )),
            P(e, i)
          );
        }
        if ("POST" === e && "/crm/projects/batch" === S) {
          const e = await f(_, "crm_clients", r.cliente_id);
          if (!e) throw c(404, "Cliente n\xe3o encontrado.");
          const t = [];
          for (const a of r.projects || []) {
            const r = l();
            t.push(
              await w(_, "crm_projects", r, {
                ...a,
                cliente_id: e.id,
                cliente_nome: e.nome_empresa,
                stage: "projeto_em_discussao",
                created_at: p(),
                updated_at: p(),
              }),
            );
          }
          return P({ count: t.length, projects: t }, i);
        }
        if (((O = j(/^\/crm\/projects\/([^/]+)\/full$/)), "GET" === e && O)) {
          const e = await f(_, "crm_projects", O[1]);
          if (!e) throw c(404, "Projeto n\xe3o encontrado.");
          return P(
            await (async function (e, t) {
              const a = await f(e, "crm_clients", t.cliente_id),
                r = (await m(e, "crm_samples")).filter(
                  (e) => e.projeto_id === t.id,
                ),
                i = (await m(e, "pd_cards")).filter(
                  (e) => e.projeto_id === t.id,
                );
              return {
                project: t,
                client: a,
                samples: r,
                pd_cards: i,
                orders: [],
              };
            })(_, e),
            i,
          );
        }
        if (((O = j(/^\/crm\/projects\/([^/]+)\/move$/)), "PUT" === e && O)) {
          return P(
            {
              ...(await v(_, "crm_projects", O[1], {
                stage: r.stage,
                motivo_arquivamento: r.motivo_arquivamento,
              })),
              to_stage: r.stage,
              trigger_batch_samples: "amostra_solicitada" === r.stage,
            },
            i,
          );
        }
        if (((O = j(/^\/crm\/projects\/([^/]+)$/)), O && "GET" === e))
          return P(await f(_, "crm_projects", O[1]), i);
        if (O && "PUT" === e) return P(await v(_, "crm_projects", O[1], r), i);
        if (O && "DELETE" === e)
          return (await T(_, "crm_projects", O[1]), P({ deleted: !0 }, i));
        if (
          "POST" === e &&
          ["/crm/samples/batch/v2", "/crm/samples/batch"].includes(S)
        )
          return P(
            await (async function (e, t, a) {
              const r = await f(e, "crm_projects", t.projeto_id);
              if (!r) throw c(404, "Projeto n\xe3o encontrado.");
              t.projeto_updates &&
                (await v(e, "crm_projects", r.id, t.projeto_updates));
              const i = await f(e, "crm_clients", r.cliente_id),
                o = await m(e, "crm_samples"),
                s = [];
              for (const d of t.samples || []) {
                var n;
                const t = l(),
                  c = o.length + s.length + 1,
                  u = (
                    null !== (n = d.variacoes) && void 0 !== n && n.length
                      ? d.variacoes
                      : [{}]
                  ).map((e, t) => ({
                    ...e,
                    id: l(),
                    codigo: `${String(c).padStart(4, "0")}-${String.fromCharCode(65 + t)}`,
                    status: "solicitada",
                    status_pd_raw: "solicitado",
                    status_pd_label: "Aberto",
                    created_at: p(),
                  }));
                let _ = await w(e, "crm_samples", t, {
                  ...d,
                  projeto_id: r.id,
                  projeto_nome: r.nome_projeto,
                  cliente_id:
                    (null === i || void 0 === i ? void 0 : i.id) ||
                    r.cliente_id,
                  cliente_nome:
                    (null === i || void 0 === i ? void 0 : i.nome_empresa) ||
                    r.cliente_nome,
                  numero_amostra: `AM-${String(c).padStart(5, "0")}`,
                  stage: "solicitada",
                  variacoes: u,
                  created_at: p(),
                  updated_at: p(),
                });
                for (const o of u) {
                  const t = await b(e, _, o, r, i, a);
                  ((o.pd_card_id = t.card.id),
                    (o.pd_request_id = t.request.id));
                }
                ((_ = await w(e, "crm_samples", t, { ..._, variacoes: u })),
                  s.push(_));
              }
              return { count: s.length, samples: s };
            })(_, r, u),
            i,
          );
        if ("GET" === e && "/crm/samples" === S) {
          await pdReconcileStatusMirrors(_);
          let e = await m(_, "crm_samples");
          return (
            q.search &&
              (e = e.filter((e) =>
                g(e, q.search, [
                  "nome_produto",
                  "nome_amostra",
                  "numero_amostra",
                  "cliente_nome",
                  "projeto_nome",
                ]),
              )),
            P(e, i)
          );
        }
        if (
          ((O = j(/^\/crm\/samples\/([^/]+)\/variacoes$/)), "POST" === e && O)
        ) {
          const e = await f(_, "crm_samples", O[1]);
          if (!e) throw c(404, "Amostra n\xe3o encontrada.");
          const t = await f(_, "crm_projects", e.projeto_id),
            a = t ? await f(_, "crm_clients", t.cliente_id) : null,
            o = [...(e.variacoes || [])];
          for (const i of r.variacoes || []) {
            const r = {
                ...i,
                id: l(),
                codigo: `${e.numero_amostra}-${String.fromCharCode(65 + o.length)}`,
                status: "solicitada",
                status_pd_raw: "solicitado",
                status_pd_label: "Aberto",
                created_at: p(),
              },
              s = await b(_, e, r, t, a, u);
            ((r.pd_card_id = s.card.id),
              (r.pd_request_id = s.request.id),
              o.push(r));
          }
          return (
            await v(_, "crm_samples", e.id, { variacoes: o }),
            P({ added: (r.variacoes || []).length, variacoes: o }, i)
          );
        }
        if (
          ((O = j(
            /^\/crm\/samples\/([^/]+)\/variacoes\/([^/]+)\/resultado-cliente$/,
          )),
          "POST" === e && O)
        ) {
          const e = await f(_, "crm_samples", O[1]),
            t = ((null === e || void 0 === e ? void 0 : e.variacoes) || []).map(
              (e) =>
                e.id === O[2]
                  ? {
                      ...e,
                      status: r.resultado,
                      resultado_cliente: r.resultado,
                      feedback_cliente: r.feedback_cliente || "",
                      resultado_em: p(),
                    }
                  : e,
            );
          return (
            await v(_, "crm_samples", O[1], { variacoes: t }),
            P(
              {
                success: !0,
                sku_created:
                  "aprovada" === r.resultado
                    ? {
                        blocked: !0,
                        reason:
                          "Gera\xe7\xe3o de SKU ser\xe1 habilitada com o m\xf3dulo de Cadastros.",
                      }
                    : null,
              },
              i,
            )
          );
        }
        if (
          ((O = j(/^\/crm\/samples\/([^/]+)\/variacoes\/([^/]+)$/)),
          O && ["PUT", "DELETE"].includes(e))
        ) {
          const t = await f(_, "crm_samples", O[1]);
          if (!t) throw c(404, "Amostra n\xe3o encontrada.");
          const a =
            "DELETE" === e
              ? (t.variacoes || []).filter((e) => e.id !== O[2])
              : (t.variacoes || []).map((e) =>
                  e.id === O[2] ? { ...e, ...r, updated_at: p() } : e,
                );
          return (
            await v(_, "crm_samples", O[1], { variacoes: a }),
            P({ success: !0 }, i)
          );
        }
        if (((O = j(/^\/crm\/samples\/([^/]+)$/)), O && "GET" === e))
          return P(await f(_, "crm_samples", O[1]), i);
        if (O && "PUT" === e) return P(await v(_, "crm_samples", O[1], r), i);
        if (O && "DELETE" === e)
          return (
            await T(_, "crm_samples", O[1]),
            P({ deleted: !0, deleted_pd_cards: 0 }, i)
          );
        if ("GET" === e && "/crm/pd/cards" === S) {
          await pdReconcileStatusMirrors(_);
          const t = await m(_, "crm_samples"),
            a = new Map(t.map((e) => [e.id, e]));
          let e = (await m(_, "pd_cards")).map((e) => {
            const t = a.get(e.amostra_id),
              r =
                t && Array.isArray(t.variacoes)
                  ? t.variacoes.find((t) => t.id === e.amostra_variacao_id)
                  : null;
            return normalizePdCard({
              ...e,
              amostra_codigo:
                e.amostra_codigo ||
                (null === r || void 0 === r ? void 0 : r.codigo),
              descricao_aplicacao:
                e.descricao_aplicacao ||
                (null === r || void 0 === r
                  ? void 0
                  : r.descricao_aplicacao),
              briefing_base:
                e.briefing_base ||
                (null === t || void 0 === t ? void 0 : t.briefing_base) ||
                (null === t || void 0 === t
                  ? void 0
                  : t.briefing_especifico),
            });
          });
          return (
            q.search &&
              (e = e.filter((e) =>
                g(e, q.search, [
                  "titulo",
                  "nome_produto",
                  "cliente_nome",
                  "projeto_nome",
                ]),
              )),
            P(e, i)
          );
        }
        if (((O = j(/^\/crm\/pd\/cards\/([^/]+)\/move$/)), "PUT" === e && O)) {
          const e = await f(_, "pd_cards", O[1]);
          if (!e) throw c(404, "Card P&D não encontrado.");
          const t = await f(_, "pd_requests", e.pd_request_id);
          if (!t) throw c(404, "Solicitação P&D vinculada não encontrada.");
          const a = PD_CARD_TO_STATUS[r.status] || (PD_STATUS_TO_CARD[r.status] ? r.status : null);
          if (!a) throw c(400, `Status P&D inválido: ${r.status}`);
          const o = t.status || "OPEN";
          await v(_, "pd_requests", t.id, { status: a });
          o !== a &&
            (await h(_, "pd_request_status_history", {
              request_id: t.id,
              pd_request_id: t.id,
              from_status: o,
              to_status: a,
              comment: r.observacao || `Movido no kanban de ${PD_STATUS_LABELS[o] || o} para ${PD_STATUS_LABELS[a] || a}`,
              changed_by: n.e7.currentUser.uid,
              changed_by_name: pdUserName(u),
              created_at: p(),
              user_id: n.e7.currentUser.uid,
            }));
          await pdSyncRequestStatus(_, t, a);
          const s = await f(_, "pd_cards", O[1]);
          return P(
            {
              ...normalizePdCard(s),
              to_status: PD_STATUS_TO_CARD[a],
              synced_to_crm: !0,
            },
            i,
          );
        }
        if (((O = j(/^\/crm\/pd\/cards\/([^/]+)$/)), O && "GET" === e)) {
          const e = await f(_, "pd_cards", O[1]);
          return P(e ? normalizePdCard(e) : null, i);
        }
        if (O && "PUT" === e) {
          const e = await f(_, "pd_cards", O[1]);
          if (!e) throw c(404, "Card P&D não encontrado.");
          const t = await v(_, "pd_cards", O[1], r),
            a = r.status_pd || r.status,
            o = a && (PD_CARD_TO_STATUS[a] || (PD_STATUS_TO_CARD[a] ? a : null));
          if (o && e.pd_request_id) {
            const t = await f(_, "pd_requests", e.pd_request_id);
            t && (await v(_, "pd_requests", t.id, { status: o }), await pdSyncRequestStatus(_, t, o));
          }
          return P(t, i);
        }
        if ("POST" === e && "/pd/requests/internal-research" === S) {
          const e = l(),
            t = l(),
            a = l(),
            s = p(),
            d = (await m(_, "pd_cards")).filter((e) =>
              String(e.numero_completo || "").startsWith("PI-"),
            ).length + 1,
            g = `PI-${String(d).padStart(3, "0")}`,
            b = [
              r.objectives ? `Objetivo da Pesquisa: ${r.objectives}` : "",
              r.description ? `Descrição: ${r.description}` : "",
              r.references ? `Referências: ${r.references}` : "",
            ].filter(Boolean).join("\n"),
            o = await w(_, "pd_requests", e, {
              ...r,
              title: r.project_name,
              client_name: "— Pesquisa Interna —",
              description: b || r.description || "",
              status: "IN_PROGRESS",
              request_type: "Pesquisa Interna",
              priority: r.priority || "Normal",
              is_internal_research: !0,
              created_by: n.e7.currentUser.uid,
              created_by_name: pdUserName(u),
              pd_card_id: a,
              created_at: s,
              updated_at: s,
            });
          return (
            await w(_, "pd_developments", t, {
              request_id: e,
              pd_request_id: e,
              assigned_to: n.e7.currentUser.uid,
              assigned_to_name: pdUserName(u),
              lab_responsible: pdUserName(u),
              current_version: 0,
              status: "active",
              started_at: s,
              completed_at: null,
              is_internal_research: !0,
            }),
            await h(_, "pd_request_status_history", { request_id: e, pd_request_id: e, from_status: null, to_status: "OPEN", changed_by: n.e7.currentUser.uid, changed_by_name: pdUserName(u), comment: "Pesquisa Interna iniciada pelo lab", created_at: s }),
            await h(_, "pd_request_status_history", { request_id: e, pd_request_id: e, from_status: "OPEN", to_status: "IN_PROGRESS", changed_by: n.e7.currentUser.uid, changed_by_name: pdUserName(u), comment: "Auto-iniciado como Pesquisa Interna", created_at: s }),
            await w(_, "pd_cards", a, {
              pd_request_id: e,
              development_id: t,
              tipo: "pesquisa_interna",
              titulo: r.project_name,
              nome_produto: r.project_name,
              produto: r.project_name,
              numero_completo: g,
              cliente: "— Pesquisa Interna —",
              descricao_aplicacao: r.description || r.objectives || "",
              briefing_base: r.description || "",
              observacoes_especificas: r.references || "",
              responsavel_pd: pdUserName(u),
              prazo_prometido: r.deadline || null,
              is_internal_research: !0,
              status_pd: "em_desenvolvimento",
              historico_movimentacoes: [{ de: "", para: "em_desenvolvimento", data: s, usuario: pdUserName(u), usuario_id: n.e7.currentUser.uid, observacao: "Pesquisa Interna iniciada" }],
              created_by: n.e7.currentUser.uid,
              created_by_name: pdUserName(u),
              created_at: s,
              updated_at: s,
            }),
            P(o, i)
          );
        }
        if ("GET" === e && "/pd/requests" === S)
          return P(await m(_, "pd_requests"), i);
        if (((O = j(/^\/pd\/requests\/([^/]+)\/full$/)), "GET" === e && O)) {
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Requisi\xe7\xe3o P&D n\xe3o encontrada.");
          return P(await pdFullDetail(_, e), i);
          return P(
            await (async function (e, t) {
              const a =
                  (await m(e, "pd_developments")).find(
                    (e) => e.request_id === t.id,
                  ) || null,
                r = null === a || void 0 === a ? void 0 : a.id,
                i = async (t) =>
                  (await m(e, t)).filter((e) => e.development_id === r),
                o = r ? await i("pd_formulas") : [],
                s = new Set(o.map((e) => e.id)),
                n = (await m(e, "pd_formula_items")).filter((e) =>
                  s.has(e.formula_id),
                ),
                d = r ? await i("pd_approvals") : [],
                c = (await m(e, "pd_pending_items")).filter(
                  (e) => e.request_id === t.id,
                ),
                u = (await m(e, "pd_request_status_history")).filter(
                  (e) => e.request_id === t.id,
                ),
                l = t.crm_sample_id
                  ? await f(e, "crm_samples", t.crm_sample_id)
                  : null,
                p = l && Array.isArray(l.variacoes)
                  ? l.variacoes.find((e) => e.id === t.crm_variacao_id) || null
                  : null,
                _ = l
                  ? {
                      ...l,
                      _source: "crm_sample",
                      _variacao_codigo: null === p || void 0 === p ? void 0 : p.codigo,
                      nome_cliente: l.cliente_nome || t.client_name || "",
                      nome_projeto: l.projeto_nome || t.project_name || "",
                      produto: l.nome_produto || t.project_name || "",
                      outras_observacoes:
                        (null === p || void 0 === p
                          ? void 0
                          : p.observacoes_especificas) || "",
                    }
                  : null;
              return {
                request: l
                  ? {
                      ...t,
                      category: t.category || l.categoria || "",
                      description:
                        t.description || l.briefing_especifico || "",
                      objectives:
                        t.objectives || l.objetivo_projeto || "",
                      references:
                        t.references || l.referencia_formula || "",
                      deadline:
                        t.deadline || l.prazo_entrega_cliente || "",
                    }
                  : t,
                development: a,
                formulas: o.map((e) => ({
                  ...e,
                  items: n.filter((t) => t.formula_id === e.id),
                })),
                tests: r ? await i("pd_tests") : [],
                samples: r ? await i("pd_samples") : [],
                approvals: d,
                approval: d[0] || null,
                costs: r ? await i("pd_costs") : [],
                documents: r ? await i("pd_documents") : [],
                updates: (await m(e, "pd_updates")).filter(
                  (e) => e.request_id === t.id,
                ),
                pending_items: c,
                pending: c,
                status_history: u,
                history: u,
                client_info: _,
                formula_cost_data: null,
                cost_versions: {},
                lab_results:
                  (null === a || void 0 === a ? void 0 : a.lab_results) || null,
                blocking_tasks: [],
              };
            })(_, e),
            i,
          );
        }
        if (((O = j(/^\/pd\/requests\/([^/]+)\/status$/)), "PUT" === e && O)) {
          const t = await f(_, "pd_requests", O[1]);
          if (!t) throw c(404, "Solicitação P&D não encontrada.");
          const a = t.status || "OPEN",
            o = r.new_status;
          if (!Object.prototype.hasOwnProperty.call(PD_ALLOWED_TRANSITIONS, o))
            throw c(400, `Status inválido: ${o}`);
          if (r.is_backward) {
            if (!r.comment || r.comment.trim().length < 10)
              throw c(400, "Justificativa obrigatória para retroceder (mínimo 10 caracteres).");
            if (PD_BACKWARD_TRANSITIONS[a] !== o)
              throw c(400, `Retrocesso não permitido: ${a} → ${o}`);
          } else if (!(PD_ALLOWED_TRANSITIONS[a] || []).includes(o)) {
            throw c(400, `Transição não permitida: ${a} → ${o}.`);
          }
          const s = (await m(_, "pd_developments")).find((e) => e.request_id === t.id || e.pd_request_id === t.id) || null;
          if ("IN_TESTS" === o) {
            if (!s) throw c(400, "Inicie o desenvolvimento antes de avançar para Em Testes.");
            const e = (await E(_, "pd_formulas", "development_id", s.id)).sort((e, t) => Number(t.version || 0) - Number(e.version || 0))[0];
            if (!e) throw c(400, "Registre a fórmula antes de avançar para Em Testes (RN-PD-02).");
            const t = await E(_, "pd_formula_items", "formula_id", e.id);
            if (!t.length) throw c(400, "Adicione ingredientes à fórmula antes de avançar para Em Testes (RN-PD-02).");
            const a = t.reduce((e, t) => e + Number(t.percentage || 0), 0);
            if (Math.abs(a - 100) > 0.5) throw c(400, `O total da fórmula deve ser 100% (atual: ${a.toFixed(2)}%).`);
            await v(_, "pd_formulas", e.id, { locked: !0, locked_at: p(), locked_by: n.e7.currentUser.uid, locked_by_name: pdUserName(u) });
          }
          if ("WAITING_APPROVAL" === o) {
            const e = (await m(_, "pd_stability_studies")).find((e) => e.request_id === t.id || e.pd_card_id === t.id),
              a = e ? await E(_, "pd_stability_readings", "study_id", e.id) : [];
            if (!e || !a.some((e) => 2 === Number(e.day_offset)))
              throw c(400, "Nenhuma leitura D48h (48 horas) registrada. Conclua o checkpoint D48h antes de entregar ao Comercial.");
          }
          if ("APPROVED" === o && s) {
            const e = await E(_, "pd_tests", "development_id", s.id);
            if (e.some((e) => "FAILED" === e.status)) throw c(400, "Existem testes com falha. Corrija antes de aprovar.");
            const t = (await E(_, "pd_approvals", "development_id", s.id))[0],
              a = { approved_by_internal: !0, approved_by_client: !0, approved_by_comercial: !0, approved_by_comercial_id: n.e7.currentUser.uid, approved_by_comercial_name: pdUserName(u), approved_at: p(), approval_date: p(), updated_at: p() };
            t ? await v(_, "pd_approvals", t.id, a) : await h(_, "pd_approvals", { ...a, development_id: s.id, request_id: O[1], notes: `Aprovado comercialmente por ${pdUserName(u)}` });
          }
          const d = await v(_, "pd_requests", O[1], { status: o }),
            g = l();
          await w(_, "pd_request_status_history", g, {
            request_id: O[1], pd_request_id: O[1], from_status: a, to_status: o,
            comment: r.comment || `Status alterado de ${a} para ${o}`,
            changed_by: n.e7.currentUser.uid, changed_by_name: pdUserName(u),
            created_at: p(), user_id: n.e7.currentUser.uid,
          });
          await pdSyncRequestStatus(_, t, o);
          if (s && "COMPLETED" === o) await v(_, "pd_developments", s.id, { status: "completed", completed_at: p() });
          return P(d, i);
        }
        if (((O = j(/^\/pd\/requests\/([^/]+)$/)), O && "GET" === e))
          return P(await f(_, "pd_requests", O[1]), i);
        if (O && "PUT" === e) {
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Solicitação P&D não encontrada.");
          const t = await v(_, "pd_requests", O[1], r);
          r.status && (await pdSyncRequestStatus(_, t, r.status));
          return P(t, i);
        }
        if (O && "DELETE" === e)
          return (await pdDeleteRequestCascade(_, O[1]), P({ deleted: !0, message: "Solicitação removida" }, i));
        if ("GET" === e && "/pd/formulas/bank" === S) {
          let e = await m(_, "pd_formulas");
          const t = await m(_, "pd_formula_items"), a = await m(_, "pd_developments"), r = await m(_, "pd_requests"), o = await m(_, "pd_approvals"), s = new Map(a.map((e) => [e.id, e])), d = new Map(r.map((e) => [e.id, e])), b = new Map(o.map((e) => [e.development_id, e]));
          e = e.map((e) => {
            const a = t.filter((t) => t.formula_id === e.id), r = s.get(e.development_id) || {}, i = d.get(r.request_id || r.pd_request_id) || {}, o = b.get(e.development_id) || {}, n = !!o.approved_by_client, c = !!o.approved_by_internal, u = !!i.is_internal_research || !i.client_name;
            return { ...pdEnrichFormula(e, a), pd_request_id: i.id, project_name: i.project_name || i.title || "", client_name: i.client_name || "", origin_label: u ? "Portfólio Kuryos" : i.client_name, origin_type: u ? "portfolio" : "cliente", request_status: i.status, approved_by_client: n, approved_by_internal: c, is_registered: n && c, item_count: a.length, total_percentage: Number(a.reduce((e, t) => e + Number(t.percentage || 0), 0).toFixed(4)), fragrance_percentage: Number(a.filter((e) => /fragr|essência|essencia|perfum|aroma/i.test(e.ingredient_name || "")).reduce((e, t) => e + Number(t.percentage || 0), 0).toFixed(4)), restricted_view: !1 };
          });
          const C = e.reduce((t, a) => (t[a.development_id] = Math.max(t[a.development_id] || 0, Number(a.version || 0)), t), {});
          e = e.map((e) => ({ ...e, is_latest_version: Number(e.version || 0) === C[e.development_id] }));
          return (q.origem && (e = e.filter((e) => e.origin_type === q.origem)), "true" === String(q.somente_registradas) && (e = e.filter((e) => e.is_registered)), q.q && (e = e.filter((e) => g(e, q.q, ["name", "nome", "project_name", "client_name", "origin_label", "created_by_name", "items"]))), P(e.sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))), i));
        }
        if (((O = j(/^\/pd\/pd-cards\/([^/]+)\/executor$/)), "PUT" === e && O))
          return P(await v(_, "pd_cards", O[1], r), i);
        if (
          "GET" === e &&
          ["/pd/clients/search", "/crm/clients/suggest-cli4"].includes(S)
        ) {
          const e = q.q || q.nome || "";
          return P(
            (await m(_, "crm_clients"))
              .filter((t) => g(t, e, ["nome_empresa", "nome_fantasia", "cnpj"]))
              .slice(0, Number(q.limit) || 20),
            i,
          );
        }
        if ("GET" === e && "/crm/skus" === S) return P(await m(_, "skus"), i);
        if ("GET" === e && "/cadastros/materiais" === S)
          return P(await m(_, "materiais"), i);
        if ("GET" === e && "/cadastros/fragrancias" === S)
          return P(await m(_, "fragrancias"), i);
        if ("GET" === e && "/compras/fornecedores" === S)
          return P(await m(_, "pd_homologacao_fornecedores"), i);
        if ("POST" === e && "/orders/direct" === S)
          return P(
            await h(_, "orders", {
              ...r,
              origem: "crm_direto",
              status: "rascunho",
            }),
            i,
          );
        if (((O = j(/^\/orders\/reorder\/([^/]+)$/)), "GET" === e && O))
          return P(
            (await m(_, "orders"))
              .filter((e) => e.cliente_id === O[1])
              .sort((e, t) =>
                String(t.updated_at || t.created_at || "").localeCompare(
                  String(e.updated_at || e.created_at || ""),
                ),
              ),
            i,
          );
        if (((O = j(/^\/crm\/projects\/([^/]+)\/proposta$/)), "GET" === e && O))
          return P(
            (await E(_, "crm_propostas", "projeto_id", O[1]))[0] || null,
            i,
          );
        if ("POST" === e && O) {
          const e = (await E(_, "crm_propostas", "projeto_id", O[1]))[0];
          return P(
            e
              ? await v(_, "crm_propostas", e.id, r)
              : await h(_, "crm_propostas", { ...r, projeto_id: O[1] }),
            i,
          );
        }
        if (
          ((O = j(/^\/crm\/projects\/([^/]+)\/amostras-status$/)),
          "GET" === e && O)
        )
          return P(
            (await E(_, "crm_samples", "projeto_id", O[1])).map((e) => ({
              id: e.id,
              numero_amostra: e.numero_amostra,
              variacoes: e.variacoes || [],
            })),
            i,
          );
        if (
          ((O = j(/^\/crm\/projects\/([^/]+)\/material-requirements$/)),
          "GET" === e && O)
        )
          return P([], i);
        if ("POST" === e && "/pd/requests" === S) {
          const e = await h(_, "pd_requests", {
              ...r,
              title: r.title || r.project_name || r.product_name,
              status: r.status || "OPEN",
              request_type: r.request_type || "CLIENT",
            }),
            t = await h(_, "pd_developments", {
              request_id: e.id,
              status: "OPEN",
            });
          return (
            await h(_, "pd_cards", {
              pd_request_id: e.id,
              development_id: t.id,
              titulo: e.title,
              nome_produto: e.title,
              cliente_nome: e.client_name || "",
              status_pd: "solicitado",
            }),
            P(e, i)
          );
        }
        if (
          ((O = j(/^\/pd\/developments\/([^/]+)\/formulas$/)), "GET" === e && O)
        )
          {
            const e = await E(_, "pd_formulas", "development_id", O[1]),
              t = await m(_, "pd_formula_items");
            return P(e.map((e) => pdEnrichFormula(e, t.filter((t) => t.formula_id === e.id))).sort((e, t) => Number(t.version || 0) - Number(e.version || 0)), i);
          }
        if ("POST" === e && O) {
          const e = await E(_, "pd_formulas", "development_id", O[1]),
            t = Math.max(0, ...e.map((e) => Number(e.version || 0))) + 1,
            a = await h(_, "pd_formulas", {
              ...r, development_id: O[1], version: t, status: r.status || "DRAFT",
              locked: !1, volume: Number(r.volume || 0), volume_unit: r.volume_unit || "mL",
              indice_perdas: Number(r.indice_perdas || 0), cotacao_usd: Number(r.cotacao_usd || 6),
              created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u),
            });
          const o = await f(_, "pd_developments", O[1]);
          o && await v(_, "pd_developments", O[1], { current_version: t });
          if (o) {
            const e = await f(_, "pd_requests", o.request_id || o.pd_request_id);
            if (e && "OPEN" === (e.status || "OPEN")) {
              await v(_, "pd_requests", e.id, { status: "IN_PROGRESS" });
              await h(_, "pd_request_status_history", {
                request_id: e.id,
                pd_request_id: e.id,
                from_status: "OPEN",
                to_status: "IN_PROGRESS",
                comment: "Desenvolvimento iniciado ao criar a primeira fórmula",
                changed_by: n.e7.currentUser.uid,
                changed_by_name: pdUserName(u),
                created_at: p(),
                user_id: n.e7.currentUser.uid,
              });
              await pdSyncRequestStatus(_, e, "IN_PROGRESS");
            }
          }
          return P({ ...a, items: [] }, i);
        }
        if (((O = j(/^\/pd\/formulas\/([^/]+)\/items$/)), "GET" === e && O))
          return P(await E(_, "pd_formula_items", "formula_id", O[1]), i);
        if ("POST" === e && O) {
          const e = await f(_, "pd_formulas", O[1]);
          if (!e) throw c(404, "Fórmula não encontrada.");
          if (e.locked) throw c(409, `Fórmula v${e.version || 1} está registrada e bloqueada. Crie uma nova versão para editar.`);
          const t = { ...r, formula_id: O[1], percentage: Number(r.percentage || 0), price_per_kg: Number(r.price_per_kg || 0), ...pdItemCosts(r, e.cotacao_usd) };
          return P(await h(_, "pd_formula_items", t), i);
        }
        if (((O = j(/^\/pd\/formula-items\/([^/]+)$/)), "PUT" === e && O)) {
          const e = await f(_, "pd_formula_items", O[1]);
          if (!e) throw c(404, "Ingrediente não encontrado.");
          const t = await f(_, "pd_formulas", e.formula_id);
          if (null !== t && void 0 !== t && t.locked) throw c(409, `Fórmula v${t.version || 1} está registrada e bloqueada. Crie uma nova versão para editar.`);
          const a = { ...e, ...r }, o = { ...r, ...pdItemCosts(a, null === t || void 0 === t ? void 0 : t.cotacao_usd) };
          return P(await v(_, "pd_formula_items", O[1], o), i);
        }
        if ("DELETE" === e && O) {
          const e = await f(_, "pd_formula_items", O[1]), t = e ? await f(_, "pd_formulas", e.formula_id) : null;
          if (null !== t && void 0 !== t && t.locked) throw c(409, `Fórmula v${t.version || 1} está registrada e bloqueada. Crie uma nova versão para editar.`);
          return await T(_, "pd_formula_items", O[1]), P({ deleted: !0 }, i);
        }
        if (
          ((O = j(/^\/pd\/formulas\/([^/]+)\/(duplicate|new-version)$/)),
          "POST" === e && O)
        ) {
          const e = await f(_, "pd_formulas", O[1]);
          if (!e) throw c(404, "Fórmula não encontrada.");
          if ("new-version" === O[2] && !e.locked) throw c(400, "Apenas fórmulas registradas podem ser versionadas. Edite diretamente a fórmula atual.");
          if ("new-version" === O[2] && (!r.justification || r.justification.trim().length < 10)) throw c(400, "Justificativa obrigatória para nova versão (mínimo 10 caracteres).");
          const a = await E(_, "pd_formulas", "development_id", e.development_id),
            o = Math.max(0, ...a.map((e) => Number(e.version || 0))) + 1,
            t = await h(_, "pd_formulas", {
              ...e,
              id: void 0,
              parent_formula_id: O[1],
              name:
                "duplicate" === O[2]
                  ? `${e.name || e.nome || "Fórmula"} - cópia`
                  : e.name,
              version: o,
              version_justification: "duplicate" === O[2] ? "Variação duplicada" : r.justification.trim(),
              justification: r.justification || "Variação duplicada",
              locked: !1, locked_at: void 0, locked_by: void 0, locked_by_name: void 0,
              created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u),
              status: "DRAFT",
            });
          for (const a of await E(_, "pd_formula_items", "formula_id", O[1]))
            await h(_, "pd_formula_items", {
              ...a,
              id: void 0,
              formula_id: t.id,
            });
          return P({ ...t, items: await E(_, "pd_formula_items", "formula_id", t.id) }, i);
        }
        if (
          ((O = j(/^\/pd\/formulas\/([^/]+)\/import-into\/([^/]+)$/)),
          "POST" === e && O)
        ) {
          const e = await f(_, "pd_formulas", O[1]);
          if (!e) throw c(404, "Fórmula de origem não encontrada.");
          const a = await f(_, "pd_developments", O[2]);
          if (!a) throw c(404, "Desenvolvimento de destino não encontrado.");
          const o = await E(_, "pd_formulas", "development_id", O[2]),
            s = Math.max(0, ...o.map((e) => Number(e.version || 0))) + 1,
            t = await h(_, "pd_formulas", {
              ...e,
              id: void 0,
              development_id: O[2],
              source_formula_id: O[1],
              importada_de_formula_id: O[1],
              version: s,
              locked: !1, locked_at: void 0, locked_by: void 0, locked_by_name: void 0,
              version_justification: "Importada de outra requisição",
              created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u),
              status: "DRAFT",
            });
          for (const a of await E(_, "pd_formula_items", "formula_id", O[1]))
            await h(_, "pd_formula_items", {
              ...a,
              id: void 0,
              formula_id: t.id,
            });
          return P({ ...t, items: await E(_, "pd_formula_items", "formula_id", t.id) }, i);
        }
        if (((O = j(/^\/pd\/formulas\/([^/]+)\/costs$/)), "GET" === e && O))
          return P(await E(_, "pd_formula_costs", "formula_id", O[1]), i);
        if ("POST" === e && O)
          return P(
            await h(_, "pd_formula_costs", { ...r, formula_id: O[1] }),
            i,
          );
        if (((O = j(/^\/pd\/formulas\/([^/]+)\/phases$/)), "GET" === e && O))
          return P(
            (await E(_, "pd_formula_phases", "formula_id", O[1])).sort(
              (e, t) => Number(e.order || 0) - Number(t.order || 0),
            ),
            i,
          );
        if ("POST" === e && O)
          return P(
            await h(_, "pd_formula_phases", { ...r, formula_id: O[1] }),
            i,
          );
        if (
          ((O = j(/^\/pd\/formulas\/([^/]+)\/phases\/reorder$/)),
          "PUT" === e && O)
        ) {
          for (const [e, t] of (r.phase_ids || []).entries())
            await v(_, "pd_formula_phases", t, { order: e });
          return P({ success: !0 }, i);
        }
        if (((O = j(/^\/pd\/formula-phases\/([^/]+)$/)), "PUT" === e && O))
          return P(await v(_, "pd_formula_phases", O[1], r), i);
        if ("DELETE" === e && O)
          return (await T(_, "pd_formula_phases", O[1]), P({ deleted: !0 }, i));
        if (((O = j(/^\/pd\/formulas\/([^/]+)$/)), "PUT" === e && O))
          return P(await v(_, "pd_formulas", O[1], r), i);
        const y = {
          "sample-batches": "pd_sample_batches",
          samples: "pd_samples",
          documents: "pd_documents",
          tests: "pd_tests",
        };
        if (
          ((O = j(
            /^\/pd\/developments\/([^/]+)\/(sample-batches|samples|documents|tests)$/,
          )),
          O && "GET" === e)
        )
          return P(await E(_, y[O[2]], "development_id", O[1]), i);
        if (O && "POST" === e) {
          const e = await f(_, "pd_developments", O[1]);
          if (!e) throw c(404, "Desenvolvimento não encontrado.");
          let t = { ...r, development_id: O[1] };
          if ("sample-batches" === O[2]) {
            const e = await f(_, "pd_formulas", r.formula_base_id);
            if (!e || e.development_id !== O[1]) throw c(404, "Fórmula base não encontrada para este desenvolvimento.");
            t = { ...pdSampleBatch(r, O[1]), created_at: p(), created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u) };
          }
          if ("samples" === O[2]) Object.assign(t, { sent_at: r.sent_to_client ? p() : null });
          if ("documents" === O[2]) Object.assign(t, { uploaded_at: p(), uploaded_by: n.e7.currentUser.uid, uploaded_by_name: pdUserName(u) });
          if ("tests" === O[2]) Object.assign(t, { status: r.status || "PENDING", dados: r.dados || {}, created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u) });
          return P(await h(_, y[O[2]], t), i);
        }
        if (
          ((O = j(/^\/pd\/developments\/([^/]+)\/sample-batches\/([^/]+)$/)),
          "PUT" === e && O)
        ) {
          const e = await f(_, "pd_sample_batches", O[2]),
            t = await f(_, "pd_formulas", r.formula_base_id);
          if (!e || e.development_id !== O[1]) throw c(404, "Lote não encontrado.");
          if (!t || t.development_id !== O[1]) throw c(404, "Fórmula base não encontrada para este desenvolvimento.");
          return P(await w(_, "pd_sample_batches", O[2], { ...e, ...pdSampleBatch(r, O[1], O[2]), created_at: e.created_at, created_by: e.created_by, created_by_name: e.created_by_name }), i);
        }
        if ("DELETE" === e && O)
          return (await T(_, "pd_sample_batches", O[2]), P({ deleted: !0 }, i));
        if (((O = j(/^\/pd\/tests\/([^/]+)$/)), O && "PUT" === e))
          return P(await v(_, "pd_tests", O[1], r), i);
        if (O && "DELETE" === e)
          return (await T(_, "pd_tests", O[1]), P({ deleted: !0 }, i));
        if (((O = j(/^\/pd\/samples\/([^/]+)$/)), "PUT" === e && O)) {
          const e = await f(_, "pd_samples", O[1]);
          if (!e) throw c(404, "Amostra não encontrada.");
          if (Object.prototype.hasOwnProperty.call(r, "client_approved") && !r.sent_to_client && !e.sent_to_client)
            throw c(409, "Amostra precisa ser enviada ao cliente antes de registrar aprovação externa.");
          return P(await v(_, "pd_samples", O[1], { ...r, sent_at: r.sent_to_client ? p() : e.sent_at }), i);
        }
        if (((O = j(/^\/pd\/documents\/([^/]+)$/)), "DELETE" === e && O))
          return (await T(_, "pd_documents", O[1]), P({ deleted: !0 }, i));
        if (
          ((O = j(/^\/pd\/developments\/([^/]+)\/approval$/)),
          "POST" === e && O)
        ) {
          const e = (await E(_, "pd_approvals", "development_id", O[1]))[0],
            t = { ...r, development_id: O[1], approval_date: p(), approved_by_user: n.e7.currentUser.uid, approved_by_user_name: pdUserName(u) };
          return P(e ? await v(_, "pd_approvals", e.id, t) : await h(_, "pd_approvals", t), i);
        }
        if (
          ((O = j(/^\/pd\/developments\/([^/]+)\/lab-results$/)),
          "PUT" === e && O)
        ) {
          const e = await f(_, "pd_developments", O[1]);
          if (!e) throw c(404, "Desenvolvimento não encontrado.");
          const t = (await E(_, "pd_lab_results", "development_id", O[1]))[0],
            a = { ...(t || {}), ...r, development_id: O[1], updated_at: p(), updated_by: n.e7.currentUser.uid, updated_by_name: pdUserName(u) };
          return P(t ? await v(_, "pd_lab_results", t.id, a) : await h(_, "pd_lab_results", a), i);
        }
        if (((O = j(/^\/pd\/developments\/([^/]+)\/cost-versions$/)), "GET" === e && O)) {
          const e = (await E(_, "pd_cost_versions", "development_id", O[1]))[0] || null,
            t = await E(_, "pd_formulas", "development_id", O[1]),
            a = await m(_, "pd_formula_items"),
            r = t.map((e) => pdEnrichFormula(e, a.filter((t) => t.formula_id === e.id))),
            o = pdFormulaCostData(r);
          return P(pdCostVersions(e, null === o || void 0 === o ? void 0 : o.total_cost_per_kg), i);
        }
        if (
          ((O = j(
            /^\/pd\/developments\/([^/]+)\/cost-versions\/(v1|v2)(?:\/(submit|finalize))?$/,
          )),
          O && ["PUT", "POST"].includes(e))
        ) {
          const e = await f(_, "pd_developments", O[1]);
          if (!e) throw c(404, "Desenvolvimento não encontrado.");
          let t = (await E(_, "pd_cost_versions", "development_id", O[1]))[0] || null;
          const a = await E(_, "pd_formulas", "development_id", O[1]),
            o = await m(_, "pd_formula_items"),
            s = pdFormulaCostData(a.map((e) => pdEnrichFormula(e, o.filter((t) => t.formula_id === e.id)))),
            d = Number((null === s || void 0 === s ? void 0 : s.total_cost_per_kg) || 0);
          let g = t || { development_id: O[1], v1: null, v2: null, total_final: 0 };
          if ("v1" === O[2] && !O[3]) {
            if ("enviado" === (null === g.v1 || void 0 === g.v1 ? void 0 : g.v1.status)) throw c(409, "Custo v1 já enviado para análise comercial.");
            const e = Number(r.ingredient_cost_manual || 0);
            g = { ...g, v1: { ingredient_cost_auto: d, ingredient_cost_manual: e, total: Number((d + e).toFixed(4)), notes: r.notes || "", status: "rascunho", submitted_at: null, submitted_by_name: null }, updated_at: p() };
          } else if ("v1" === O[2] && "submit" === O[3]) {
            if (!g.v1) throw c(400, "Salve um rascunho de custo antes de enviar.");
            g = { ...g, v1: { ...g.v1, status: "enviado", submitted_at: p(), submitted_by_name: pdUserName(u) }, updated_at: p() };
          } else if ("v2" === O[2] && !O[3]) {
            if ("enviado" !== (null === g.v1 || void 0 === g.v1 ? void 0 : g.v1.status)) throw c(400, "Aguardando envio do custo v1 pelo P&D.");
            if ("finalizado" === (null === g.v2 || void 0 === g.v2 ? void 0 : g.v2.status)) throw c(409, "Custo v2 já foi finalizado.");
            const e = Number(r.packaging_cost || 0) + Number(r.labor_cost || 0) + Number(r.overhead_cost || 0) + Number(r.other_cost || 0);
            g = { ...g, v2: { ...r, total: Number(e.toFixed(4)), status: "rascunho" }, total_final: Number((Number(g.v1.total || 0) + e).toFixed(4)), updated_at: p() };
          } else if ("v2" === O[2] && "finalize" === O[3]) {
            if (!g.v2) throw c(400, "Salve os dados de custo comercial antes de finalizar.");
            g = { ...g, v2: { ...g.v2, status: "finalizado", finalized_at: p(), finalized_by_name: pdUserName(u), approved_by_commercial: !0 }, updated_at: p() };
          }
          t = t ? await w(_, "pd_cost_versions", t.id, { ...g, id: t.id }) : await h(_, "pd_cost_versions", g);
          return P(pdCostVersions(t, d), i);
        }
        if ("/pd/catalog" === S && "GET" === e) {
          let e = await m(_, "pd_catalog");
          return (q.q && (e = e.filter((e) => g(e, q.q, ["nome", "inci", "codigo_interno", "fornecedor", "fornecedores"]))), q.categoria && (e = e.filter((e) => e.categoria === q.categoria)), P(e.sort((e, t) => String(e.nome || "").localeCompare(String(t.nome || ""))), i));
        }
        if ("/pd/catalog" === S && "POST" === e)
          return P(await h(_, "pd_catalog", { ...r, preco_rs_kg: Number(r.preco_rs_kg || 0), moeda: r.moeda || "BRL", unidade: r.unidade || "kg", fornecedores: r.fornecedores || [], ultima_atualizacao: p(), atualizado_por: pdUserName(u), atualizado_por_id: n.e7.currentUser.uid, created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u) }), i);
        if (
          ((O = j(/^\/pd\/catalog\/([^/]+)\/price-history$/)), "GET" === e && O)
        )
          return P(
            await E(_, "pd_catalog_price_history", "catalog_id", O[1]),
            i,
          );
        if (((O = j(/^\/pd\/catalog\/([^/]+)$/)), "PUT" === e && O)) {
          const e = await f(_, "pd_catalog", O[1]),
            t = await v(_, "pd_catalog", O[1], r);
          return (
            void 0 !== r.preco_rs_kg &&
              Number(r.preco_rs_kg) !== Number((null === e || void 0 === e ? void 0 : e.preco_rs_kg) || 0) &&
              (await h(_, "pd_catalog_price_history", {
                catalog_id: O[1],
                catalog_item_id: O[1],
                old_price: null === e || void 0 === e ? void 0 : e.preco_rs_kg,
                new_price: Number(r.preco_rs_kg),
                preco_anterior: null === e || void 0 === e ? void 0 : e.preco_rs_kg,
                preco_novo: Number(r.preco_rs_kg),
                updated_by: n.e7.currentUser.uid,
                updated_by_name: pdUserName(u),
                created_at: p(),
              })),
            P(await v(_, "pd_catalog", O[1], { ultima_atualizacao: p(), atualizado_por: pdUserName(u), atualizado_por_id: n.e7.currentUser.uid }), i)
          );
        }
        if ("DELETE" === e && O) {
          for (const e of (await m(_, "pd_formula_items")).filter((e) => e.catalog_id === O[1])) await v(_, "pd_formula_items", e.id, { catalog_id: null });
          for (const e of (await m(_, "pd_catalog_price_history")).filter((e) => e.catalog_id === O[1] || e.catalog_item_id === O[1])) await T(_, "pd_catalog_price_history", e.id);
          return (await T(_, "pd_catalog", O[1]), P({ deleted: !0 }, i));
        }
        if ("/pd/stock" === S && "GET" === e) {
          let e = await m(_, "pd_stock");
          return (q.categoria && (e = e.filter((e) => e.categoria === q.categoria)), q.q && (e = e.filter((e) => g(e, q.q, ["nome", "codigo_interno", "formula_ref"]))), "true" === String(q.low_stock) && (e = e.filter((e) => Number(e.quantidade_minima || 0) > 0 && Number(e.quantidade_atual || 0) <= Number(e.quantidade_minima || 0))), P(e.sort((e, t) => String(e.nome || "").localeCompare(String(t.nome || ""))), i));
        }
        if ("/pd/stock" === S && "POST" === e) {
          const t = await h(_, "pd_stock", { ...r, quantidade_atual: Number(r.quantidade_atual || 0), quantidade_minima: Number(r.quantidade_minima || 0), custo_unitario: Number(r.custo_unitario || 0), created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u) });
          if (Number(t.quantidade_atual || 0) > 0) await h(_, "pd_stock_movements", { stock_id: t.id, stock_item_id: t.id, tipo: "entrada", type: "IN", quantidade: Number(t.quantidade_atual), quantity: Number(t.quantidade_atual), saldo_anterior: 0, saldo_novo: Number(t.quantidade_atual), motivo: "Estoque inicial", lote: t.lote || null, user_id: n.e7.currentUser.uid, user_name: pdUserName(u), created_at: p() });
          return P(t, i);
        }
        if ("/pd/stock/alerts" === S && "GET" === e) {
          const e = await m(_, "pd_stock"), t = new Date(Date.now() + 30 * 864e5);
          return P({ low_stock: e.filter((e) => Number(e.quantidade_minima || 0) > 0 && Number(e.quantidade_atual || 0) <= Number(e.quantidade_minima || 0)), expiring: e.filter((e) => e.validade && new Date(e.validade) <= t) }, i);
        }
        if ("/pd/stock/check-product" === S && "GET" === e) {
          const e = (await m(_, "pd_stock")).find((e) =>
            g(e, q.produto_nome, ["product_name", "produto_nome", "nome"]),
          );
          return P(
            {
              available: !!e && Number(e.quantidade_atual || e.quantity || e.quantidade || 0) > 0,
              item: e,
            },
            i,
          );
        }
        if ("/pd/stock/movements" === S && "GET" === e) {
          let e = await m(_, "pd_stock_movements");
          return (q.tipo && (e = e.filter((e) => (e.tipo || e.type) === q.tipo)), P(e.sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))).slice(0, Number(q.limit || 500)), i));
        }
        if (((O = j(/^\/pd\/stock\/([^/]+)\/movements$/)), "GET" === e && O))
          return P((await m(_, "pd_stock_movements")).filter((e) => e.stock_id === O[1] || e.stock_item_id === O[1]).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))), i);
        if ("POST" === e && O) {
          const t = await f(_, "pd_stock", O[1]);
          if (!t) throw c(404, "Item de estoque não encontrado.");
          const a = Number(t.quantidade_atual || 0), d = Number(r.quantity || r.quantidade || 0), g = String(r.type || r.tipo || "entrada").toLowerCase(), b = ["out", "saida", "saída"].includes(g) ? a - d : "ajuste" === g ? d : a + d;
          if (b < 0) throw c(400, "Saldo insuficiente para esta saída.");
          const e = await h(_, "pd_stock_movements", { ...r, stock_id: O[1], stock_item_id: O[1], saldo_anterior: a, saldo_novo: b, user_id: n.e7.currentUser.uid, user_name: pdUserName(u), created_at: p() });
          return (
            await v(_, "pd_stock", O[1], { quantidade_atual: b, updated_at: p() }),
            P(e, i)
          );
        }
        if (((O = j(/^\/pd\/stock\/([^/]+)$/)), "PUT" === e && O))
          return P(await v(_, "pd_stock", O[1], r), i);
        if ("DELETE" === e && O) {
          for (const e of (await m(_, "pd_stock_movements")).filter((e) => e.stock_id === O[1] || e.stock_item_id === O[1])) await T(_, "pd_stock_movements", e.id);
          return (await T(_, "pd_stock", O[1]), P({ deleted: !0 }, i));
        }
        const R = {
          fornecedores: "pd_homologacao_fornecedores",
          mps: "pd_homologacao_mps",
        };
        if (
          ((O = j(/^\/pd\/homologacao\/(fornecedores|mps)$/)), O && "GET" === e)
        ) {
          let e = await m(_, R[O[1]]);
          return (q.status && (e = e.filter((e) => e.status === q.status)), q.tipo_mp && (e = e.filter((e) => e.tipo_mp === q.tipo_mp)), (q.search || q.q) && (e = e.filter((e) => g(e, q.search || q.q, ["razao_social", "nome_fantasia", "cnpj", "nome", "inci", "codigo_interno", "fornecedor_nome"]))), P(e, i));
        }
        if (O && "POST" === e) return P(await h(_, R[O[1]], { ...r, status: r.status || "pendente", historico: r.historico || [], created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u) }), i);
        if (
          ((O = j(/^\/pd\/homologacao\/(fornecedores|mps)\/([^/]+)$/)),
          O && "PUT" === e)
        )
          return P(await v(_, R[O[1]], O[2], r), i);
        if (O && "DELETE" === e)
          return (await T(_, R[O[1]], O[2]), P({ deleted: !0 }, i));
        if (
          ((O = j(
            /^\/pd\/homologacao\/(fornecedores|mps)\/([^/]+)\/(aprovar|reprovar|avaliar|homologar)$/,
          )),
          O && "POST" === e)
        ) {
          const e = await f(_, R[O[1]], O[2]);
          if (!e) throw c(404, "Registro de homologação não encontrado.");
          const t = !1 === r.aprovado || "reprovar" === O[3] ? ("mps" === O[1] ? "reprovada" : "reprovado") : ("mps" === O[1] ? "homologada" : "homologado"),
            a = { evento: t, por: pdUserName(u), por_id: n.e7.currentUser.uid, data: p(), parecer: r.parecer || r.parecer_homologacao || "" };
          return P(await v(_, R[O[1]], O[2], { ...r, status: t, parecer_homologacao: a.parecer, homologado_por: pdUserName(u), homologado_por_id: n.e7.currentUser.uid, data_homologacao: a.data, historico: [...(e.historico || []), a] }), i);
        }
        if ("/pd/homologacao/dashboard" === S && "GET" === e) {
          const e = await m(_, "pd_homologacao_fornecedores"),
            t = await m(_, "pd_homologacao_mps"),
            a = (e, t) => e.reduce((e, a) => ({ ...e, [a[t] || ""]: (e[a[t] || ""] || 0) + 1 }), {}),
            r = t.filter((e) => ["reprovada", "suspensa", "bloqueada"].includes(e.status));
          return P(
            {
              fornecedores: { total: e.length, por_status: a(e, "status"), por_categoria: a(e, "categoria") },
              mps: { total: t.length, por_status: a(t, "status"), por_tipo: a(t, "tipo_mp"), bloqueadas_total: r.length },
              alertas: { fornecedor_unico: [], risco_fornecimento: [], mps_bloqueadas: r.slice(0, 50).map((e) => ({ id: e.id, nome: e.nome, status: e.status, fornecedor_nome: e.fornecedor_nome || "" })) },
              total_fornecedores: e.length,
              fornecedores_aprovados: e.filter((e) => "homologado" === e.status)
                .length,
              total_mps: t.length,
              mps_aprovadas: t.filter((e) => "homologada" === e.status).length,
            },
            i,
          );
        }
        if (
          ((O = j(/^\/pd\/requests\/([^/]+)\/(updates|pending)$/)),
          O && "GET" === e)
        ) {
          let e = (await m(_, "updates" === O[2] ? "pd_updates" : "pd_pending_items")).filter((e) => e.request_id === O[1] || e.pd_request_id === O[1]);
          return ("pending" === O[2] && q.status && (e = e.filter((e) => e.status === q.status)), P(e.map((e) => "pending" === O[2] ? { ...e, status_calc: "pendente" === e.status && e.data_prevista && new Date(e.data_prevista) < new Date() ? "atrasado" : e.status } : e).sort((e, t) => String(t.created_at || "").localeCompare(String(e.created_at || ""))), i));
        }
        if (
          ((O = j(/^\/pd\/requests\/([^/]+)\/(updates|pending)$/)),
          O && "POST" === e)
        ) {
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Solicitação não encontrada.");
          const t = p(),
            a = "updates" === O[2],
            o = await h(_, a ? "pd_updates" : "pd_pending_items", a ? {
              ...r, request_id: O[1], pd_request_id: O[1], tipo: r.tipo || "observacao", mensagem: String(r.mensagem || "").trim(), visivel_comercial: !!r.visivel_comercial, recebido: !1, recebido_em: null, user_id: n.e7.currentUser.uid, user_name: pdUserName(u), user_role: u.role || "", created_at: t,
            } : {
              ...r, request_id: O[1], pd_request_id: O[1], descricao: String(r.descricao || "").trim(), fornecedor: String(r.fornecedor || "").trim(), observacoes: String(r.observacoes || "").trim(), data_solicitacao: t, data_recebido: null, status: "pendente", user_id: n.e7.currentUser.uid, user_name: pdUserName(u), created_at: t, updated_at: t,
            });
          if (!a)
            await h(_, "pd_updates", { request_id: O[1], pd_request_id: O[1], tipo: "pendencia_criada", mensagem: `Solicitado(a) ${r.tipo}: ${r.descricao}${r.data_prevista ? ` — previsão ${r.data_prevista}` : ""}`, visivel_comercial: !0, user_id: n.e7.currentUser.uid, user_name: pdUserName(u), user_role: u.role || "", pending_item_id: o.id, created_at: t });
          return P(o, i);
        }
        if (
          ((O = j(/^\/pd\/(updates|pending)\/([^/]+)(?:\/received)?$/)),
          O && "PUT" === e)
        ) {
          const e = "updates" === O[1] ? "pd_updates" : "pd_pending_items",
            t = await f(_, e, O[2]);
          if (!t) throw c(404, "Registro não encontrado.");
          let a = r;
          if (S.endsWith("/received"))
            a = { recebido: !0, recebido_em: p(), recebido_por: n.e7.currentUser.uid, recebido_por_nome: pdUserName(u) };
          else if ("pd_pending_items" === e && "recebido" === r.status && "recebido" !== t.status) {
            a = { ...r, data_recebido: p(), updated_at: p() };
            await h(_, "pd_updates", { request_id: t.request_id || t.pd_request_id, pd_request_id: t.pd_request_id || t.request_id, tipo: "pendencia_resolvida", mensagem: `Recebido(a): ${t.descricao}`, visivel_comercial: !0, user_id: n.e7.currentUser.uid, user_name: pdUserName(u), user_role: u.role || "", pending_item_id: t.id, created_at: p() });
          }
          return P(await v(_, e, O[2], a), i);
        }
        if (O && "DELETE" === e)
          return (
            await T(
              _,
              "updates" === O[1] ? "pd_updates" : "pd_pending_items",
              O[2],
            ),
            P({ deleted: !0 }, i)
          );
        if (
          ((O = j(/^\/pd\/requests\/([^/]+)\/ficha-tecnica-ui$/)),
          "GET" === e && O)
        ) {
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Solicitação P&D não encontrada.");
          const t = (await m(_, "pd_developments")).find((e) => e.request_id === O[1] || e.pd_request_id === O[1]) || null,
            a = t ? (await E(_, "pd_formulas", "development_id", t.id)).sort((e, t) => Number(t.version || 0) - Number(e.version || 0))[0] || null : null,
            r = a ? await E(_, "pd_formula_items", "formula_id", a.id) : [],
            o = (await E(_, "pd_ficha_tecnica", "request_id", O[1]))[0] || (await E(_, "pd_ficha_tecnica", "pd_request_id", O[1]))[0] || {},
            s = t ? (await E(_, "pd_lab_results", "development_id", t.id))[0] || (null === t || void 0 === t ? void 0 : t.lab_results) || {} : {},
            d = { ...o };
          for (const [e, t] of Object.entries({
            aspecto: null === s.sensorial || void 0 === s.sensorial ? void 0 : s.sensorial.aspecto,
            cor: null === s.sensorial || void 0 === s.sensorial ? void 0 : s.sensorial.cor,
            odor: null === s.sensorial || void 0 === s.sensorial ? void 0 : s.sensorial.odor,
            ph: (null === s.ph || void 0 === s.ph ? void 0 : s.ph.valor_medido) || (null === s.ph || void 0 === s.ph ? void 0 : s.ph.valor),
            densidade: "", teor_alcool: "",
          })) {
            const a = d[e] && "object" === typeof d[e] ? d[e] : { especificacao: "", resultado: d[e] || "", pa: "" };
            d[e] = { especificacao: a.especificacao || "", resultado: a.resultado || t || "", pa: a.pa || "" };
          }
          return P({ request: e, development: t, formula: a, formula_items: r, analise: d, lab_results: s, auto_filled: {} }, i);
        }
        if ("PUT" === e && O) {
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Solicitação P&D não encontrada.");
          const t = (await m(_, "pd_developments")).find((e) => e.request_id === O[1] || e.pd_request_id === O[1]) || null,
            a = (await E(_, "pd_ficha_tecnica", "request_id", O[1]))[0] || (await E(_, "pd_ficha_tecnica", "pd_request_id", O[1]))[0],
            o = { ...(a || {}), ...r, request_id: O[1], pd_request_id: O[1], development_id: null === t || void 0 === t ? void 0 : t.id, updated_at: p(), updated_by: n.e7.currentUser.uid, updated_by_name: pdUserName(u) };
          return P(a ? await w(_, "pd_ficha_tecnica", a.id, { ...o, id: a.id }) : await h(_, "pd_ficha_tecnica", o), i);
        }
        if (
          ((O = j(/^\/pd\/requests\/([^/]+)\/link-to-crm$/)), "PUT" === e && O)
        )
          return P(await v(_, "pd_requests", O[1], r), i);
        if (
          ((O = j(/^\/pd\/requests\/([^/]+)\/stability-study$/)),
          "GET" === e && O)
        ) {
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Solicitação P&D não encontrada.");
          let t = (await m(_, "pd_stability_studies")).find((e) => e.request_id === O[1] || e.pd_card_id === O[1]) || null;
          if (!t) {
            const a = p();
            t = await h(_, "pd_stability_studies", {
              request_id: O[1], pd_card_id: O[1], amostra_id: e.crm_sample_id || e.linked_amostra_id,
              amostra_variacao_id: e.crm_variacao_id || e.linked_variacao_id,
              status: "ativo", started_at: a, updated_at: a,
              conditions: PD_STABILITY_CONDITIONS.map((e) => ({ ...e, completed_day_offsets: [], next_due_day_offset: e.checkpoints[0], next_due_at: a })),
              summary: { overall_status: "pendente_d0", completed_readings: 0 },
            });
          }
          const a = (await E(_, "pd_stability_readings", "study_id", t.id)).sort((e, t) => Number(e.day_offset || 0) - Number(t.day_offset || 0));
          return P({ study: t, readings: a, constants: { conditions: PD_STABILITY_CONDITIONS, parameters: PD_STABILITY_PARAMETERS, checkpoints: [1, 2, 7, 30, 60, 90] } }, i);
        }
        if (
          ((O = j(/^\/pd\/stability\/studies\/([^/]+)\/readings$/)),
          "POST" === e && O)
        ) {
          const e = await f(_, "pd_stability_studies", O[1]);
          if (!e) throw c(404, "Estudo de estabilidade não encontrado.");
          const t = PD_STABILITY_CONDITIONS.find((e) => e.code === r.condition_code);
          if (!t) throw c(400, "Condição de estabilidade inválida.");
          if (!t.checkpoints.includes(Number(r.day_offset))) throw c(400, "Checkpoint inválido para esta condição.");
          const a = await E(_, "pd_stability_readings", "study_id", O[1]);
          if (a.some((e) => e.condition_code === r.condition_code && Number(e.day_offset) === Number(r.day_offset))) throw c(409, "Já existe leitura registrada para esta condição e checkpoint.");
          if (!r.parameters || !Object.keys(r.parameters).length) throw c(400, "Informe ao menos um parâmetro válido da leitura.");
          const o = await h(_, "pd_stability_readings", { ...r, study_id: O[1], condition_label: t.label, reading_at: r.reading_at || p(), created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u) }),
            s = (e.conditions || []).map((e) => e.code === r.condition_code ? { ...e, completed_day_offsets: [...new Set([...(e.completed_day_offsets || []), Number(r.day_offset)])].sort((e, t) => e - t), last_reading_at: o.reading_at } : e),
            d = await v(_, "pd_stability_studies", O[1], { conditions: s, summary: { overall_status: "em_dia", completed_readings: a.length + 1 } });
          return P({ reading: o, study: d }, i);
        }
        if ("POST" === e && "/upload" === S) {
          const e =
            "undefined" !== typeof FormData && r instanceof FormData
              ? [...r.values()].find((e) => e instanceof File)
              : null;
          if (!e) throw c(400, "Arquivo nao informado.");
          try {
            const t = (0, s.KR)(n.Pf, `erp/${_}/uploads/${l()}-${e.name}`);
            return (
              await (0, s.D)(t, e, {
                contentType: e.type || "application/octet-stream",
              }),
              P({ url: await (0, s.qk)(t), filename: e.name }, i)
            );
          } catch {
            if (e.size > 5242880)
              throw c(
                413,
                "Arquivo maior que 5 MB. Ative o Firebase Storage para anexos grandes.",
              );
            const t = await new Promise((t, a) => {
                const r = new FileReader();
                ((r.onload = () => t(r.result)),
                  (r.onerror = () => a(r.error)),
                  r.readAsDataURL(e));
              }),
              a = await h(_, "uploads", {
                filename: e.name,
                content_type: e.type,
                size: e.size,
                url: t,
              });
            return P(
              { url: a.url, filename: e.name, id: a.id, storage: "database" },
              i,
            );
          }
        }
        if ("GET" === e && (/\.pdf$/.test(S) || S.endsWith("/ficha-tecnica")))
          return P(
            (function (e, t) {
              const a = `<!doctype html><meta charset="utf-8"><title>${e}</title><h1>${e}</h1><pre>${JSON.stringify(t, null, 2)}</pre>`;
              return new Blob([a], { type: "text/html;charset=utf-8" });
            })("Documento Kuryos", { path: S, generated_at: p() }),
            i,
          );
        if ("GET" === e && "/pd/metrics" === S) {
          const e = await m(_, "pd_requests"),
            t = await m(_, "pd_formulas");
          const a = e.reduce((e, t) => ({ ...e, [t.status || "OPEN"]: (e[t.status || "OPEN"] || 0) + 1 }), {}),
            r = e.reduce((e, t) => ({ ...e, [t.priority || "Normal"]: (e[t.priority || "Normal"] || 0) + 1 }), {});
          return P(
            {
              total: e.length,
              total_requests: e.length,
              open_requests: e.filter(
                (e) => !["DONE", "CANCELLED", "CONCLUIDO"].includes(e.status),
              ).length,
              total_formulas: t.length,
              by_status: a,
              by_priority: { Baixa: 0, Normal: 0, Alta: 0, Urgente: 0, ...r },
            },
            i,
          );
        }
        if (
          ((O = j(/^\/workflow\/tasks\/([^/]+)\/decision$/)), "PUT" === e && O)
        ) {
          const e = await f(_, "workflow_tasks", O[1]);
          if (!e) throw c(404, "Tarefa de aprovação não encontrada.");
          if ("rejected" === r.decision && !String(r.comment || "").trim()) throw c(400, "Justificativa obrigatória para reprovação.");
          const t = await v(_, "workflow_tasks", O[1], { ...r, decision_comment: r.comment || "", status: "concluida", decided_at: p(), decided_by: n.e7.currentUser.uid, decided_by_name: pdUserName(u) }),
            a = await f(_, "pd_document_versions", e.entity_id);
          if (a) {
            const t = (await E(_, "workflow_tasks", "entity_id", a.id)).filter((e) => "pd_document" === e.entity_type),
              r = t.some((e) => "rejected" === e.decision),
              i = t.length && t.every((e) => "concluida" === e.status && "approved" === e.decision);
            if (r) await v(_, "pd_document_versions", a.id, { status: "reprovado", active_for_operation: !1 });
            else if (i) {
              for (const e of (await m(_, "pd_document_versions")).filter((e) => e.pd_request_id === a.pd_request_id && e.doc_type === a.doc_type && e.id !== a.id && e.active_for_operation)) await v(_, "pd_document_versions", e.id, { active_for_operation: !1 });
              await v(_, "pd_document_versions", a.id, { status: "aprovado", active_for_operation: !0, approved_at: p() });
            }
          }
          return P(t, i);
        }
        if (
          ((O = j(
            /^\/pd\/requests\/([^/]+)\/live-documents\/([^/]+)\/versions$/,
          )),
          "GET" === e && O)
        )
          return P(
            (await m(_, "pd_document_versions")).filter(
              (e) => (e.request_id === O[1] || e.pd_request_id === O[1]) && (e.document_type === O[2] || e.doc_type === O[2]),
            ).sort((e, t) => Number(t.version_number || 0) - Number(e.version_number || 0)),
            i,
          );
        if (
          ((O = j(
            /^\/pd\/requests\/([^/]+)\/live-documents\/([^/]+)\/generate$/,
          )),
          "POST" === e && O)
        ) {
          if (!["ficha_tecnica", "epa"].includes(O[2])) throw c(400, "Tipo de documento vivo inválido.");
          const e = await f(_, "pd_requests", O[1]);
          if (!e) throw c(404, "Solicitação não encontrada.");
          const t = await pdFullDetail(_, e),
            a = (await m(_, "pd_document_versions")).filter((e) => (e.request_id === O[1] || e.pd_request_id === O[1]) && (e.document_type === O[2] || e.doc_type === O[2])),
            o = Math.max(0, ...a.map((e) => Number(e.version_number || 0))) + 1,
            s = O[2] === "ficha_tecnica" ? "FT" : "EPA",
            d = { request: t.request, development: t.development, formula: t.formulas[0] || null, formula_items: (t.formulas[0] || {}).items || [], lab_results: t.lab_results, approval: t.approval, ficha_tecnica: (await E(_, "pd_ficha_tecnica", "request_id", O[1]))[0] || null },
            g = await h(_, "pd_document_versions", { ...r, request_id: O[1], pd_request_id: O[1], document_type: O[2], doc_type: O[2], version_number: o, version_code: `${s}-${String(o).padStart(3, "0")}`, status: "em_revisao", active_for_operation: !1, snapshot: d, changed_fields: r.changed_fields || [O[2]], source_changes: r.source_changes || [], source_trigger: "manual", generated_by: n.e7.currentUser.uid, created_by: n.e7.currentUser.uid, created_by_name: pdUserName(u), created_at: p() });
          await h(_, "workflow_tasks", { entity_type: "pd_document", entity_id: g.id, title: `Aprovar ${g.version_code}`, status: "pendente", decision: null, responsible_id: n.e7.currentUser.uid, responsible_name: pdUserName(u), due_date: null, metadata: { approver_role: u.role || "admin" }, created_at: p() });
          return P(g, i);
        }
        if (((O = j(/^\/pd\/requests\/([^/]+)\/live-documents\/([^/]+)\/current$/)), "GET" === e && O)) {
          const e = (await m(_, "pd_document_versions")).filter((e) => (e.request_id === O[1] || e.pd_request_id === O[1]) && (e.document_type === O[2] || e.doc_type === O[2])).sort((e, t) => Number(t.version_number || 0) - Number(e.version_number || 0))[0];
          if (!e) throw c(404, "Documento vivo não encontrado.");
          return P(e, i);
        }
        if (((O = j(/^\/pd\/document-versions\/([^/]+)$/)), "GET" === e && O)) {
          const e = await f(_, "pd_document_versions", O[1]);
          if (!e) throw c(404, "Versão de documento não encontrada.");
          return P(e, i);
        }
        if (
          ((O = j(/^\/pd\/document-versions\/([^/]+)\/diff$/)),
          "GET" === e && O)
        ) {
          const e = await f(_, "pd_document_versions", O[1]);
          if (!e) throw c(404, "Versão de documento não encontrada.");
          const t = (await m(_, "pd_document_versions")).filter((t) => t.id !== e.id && (t.request_id === e.request_id || t.pd_request_id === e.pd_request_id) && (t.document_type === e.document_type || t.doc_type === e.doc_type) && Number(t.version_number || 0) < Number(e.version_number || 0) && "reprovado" !== t.status).sort((e, t) => Number(t.version_number || 0) - Number(e.version_number || 0))[0] || null,
            a = pdFlattenSnapshot(e.snapshot || {}),
            r = pdFlattenSnapshot((t || {}).snapshot || {}),
            o = [...new Set([...Object.keys(a), ...Object.keys(r)])].sort().filter((e) => a[e] !== r[e]).map((e) => ({ path: e, label: e.replaceAll("_", " ").replaceAll(".", " · "), before: r[e], after: a[e] })),
            s = (await E(_, "workflow_tasks", "entity_id", e.id)).filter((e) => "pd_document" === e.entity_type);
          return P({ current: { ...e }, previous: t ? { id: t.id, version_code: t.version_code, version_number: t.version_number, status: t.status, snapshot: t.snapshot } : null, differences: o, changes: o, approval_tasks: s }, i);
        }
        throw c(501, `Rota Firebase ainda n\xe3o adaptada: ${e} ${S}`);
      }
      const S = {
          defaults: { baseURL: "firebase://erpkuryos" },
          interceptors: { response: { use: () => {} } },
          request() {
            let e =
              arguments.length > 0 && void 0 !== arguments[0]
                ? arguments[0]
                : {};
            return $(String(e.method || "GET").toUpperCase(), e.url, e.data, e);
          },
          get(e) {
            return $(
              "GET",
              e,
              void 0,
              arguments.length > 1 && void 0 !== arguments[1]
                ? arguments[1]
                : {},
            );
          },
          post(e, t) {
            return $(
              "POST",
              e,
              t,
              arguments.length > 2 && void 0 !== arguments[2]
                ? arguments[2]
                : {},
            );
          },
          put(e, t) {
            return $(
              "PUT",
              e,
              t,
              arguments.length > 2 && void 0 !== arguments[2]
                ? arguments[2]
                : {},
            );
          },
          patch(e, t) {
            return $(
              "PATCH",
              e,
              t,
              arguments.length > 2 && void 0 !== arguments[2]
                ? arguments[2]
                : {},
            );
          },
          delete(e) {
            return $(
              "DELETE",
              e,
              void 0,
              arguments.length > 1 && void 0 !== arguments[1]
                ? arguments[1]
                : {},
            );
          },
        },
        q = S,
        j = [...new Set(i.Ex.map((e) => `${e}/api`))],
        O = r.A.create({
          baseURL: `${i.fn}/api`,
          withCredentials: !0,
          headers: { "Content-Type": "application/json" },
        });
      O.interceptors.response.use(
        (e) => {
          var t, a;
          return (
            (a =
              (null === (t = e.config) || void 0 === t ? void 0 : t.baseURL) ||
              O.defaults.baseURL) && (0, i.fq)(a.replace(/\/api$/, "")),
            e
          );
        },
        async (e) => {
          const t = null === e || void 0 === e ? void 0 : e.config;
          if (
            !t ||
            t._backendFallbackTried ||
            !(function (e) {
              return (
                !(null !== e && void 0 !== e && e.response) &&
                (!(null === e || void 0 === e || !e.request) ||
                  "ERR_NETWORK" ===
                    (null === e || void 0 === e ? void 0 : e.code))
              );
            })(e)
          )
            return Promise.reject(e);
          const a = t.baseURL || O.defaults.baseURL,
            r = j.find((e) => e !== a);
          if (!r) return Promise.reject(e);
          ((t._backendFallbackTried = !0), (t.baseURL = r));
          const i = O.defaults.baseURL;
          O.defaults.baseURL = r;
          try {
            return await O.request(t);
          } catch (o) {
            return ((O.defaults.baseURL = i), Promise.reject(o));
          }
        },
      );
      const y =
        "backend" !==
        {
          NODE_ENV: "production",
          PUBLIC_URL: "",
          WDS_SOCKET_HOST: void 0,
          WDS_SOCKET_PATH: void 0,
          WDS_SOCKET_PORT: void 0,
          FAST_REFRESH: !0,
        }.REACT_APP_DATA_PROVIDER
          ? q
          : O;
      globalThis.__KURYOS_PD_API__ = q;
    },
    1636(e, t, a) {
      var r;
      a.d(t, {
        Ex: () => _,
        S8: () => p,
        fn: () => m,
        fq: () => d,
        pM: () => l,
      });
      const i =
          null ===
            (r = {
              NODE_ENV: "production",
              PUBLIC_URL: "",
              WDS_SOCKET_HOST: void 0,
              WDS_SOCKET_PATH: void 0,
              WDS_SOCKET_PORT: void 0,
              FAST_REFRESH: !0,
            }.REACT_APP_BACKEND_URL) || void 0 === r
            ? void 0
            : r.trim(),
        o = "kuryos.backend_url";
      function s(e) {
        return "string" === typeof e ? e.trim().replace(/\/+$/, "") : "";
      }
      function n() {
        if ("undefined" === typeof window) return "";
        try {
          const e = s(window.localStorage.getItem(o)),
            { origin: t, port: a } = window.location;
          return /^3\d{3}$/.test(a || "") && e === s(t) ? "" : e;
        } catch {
          return "";
        }
      }
      function d(e) {
        const t = s(e);
        if (t && "undefined" !== typeof window)
          try {
            window.localStorage.setItem(o, t);
          } catch {}
      }
      function c() {
        if ("undefined" === typeof window)
          return ["http://127.0.0.1:8000", "http://127.0.0.1:8001"];
        const {
            protocol: e,
            hostname: t,
            port: a,
            origin: r,
          } = window.location,
          i =
            "localhost" === t
              ? ["localhost", "127.0.0.1"]
              : "127.0.0.1" === t
                ? ["127.0.0.1", "localhost"]
                : [t];
        return /^3\d{3}$/.test(a || "")
          ? i.flatMap((t) => [`${e}//${t}:8000`, `${e}//${t}:8001`])
          : [r];
      }
      function u() {
        return ((e = [i, n(), ...c()]), [...new Set(e.map(s).filter(Boolean))]);
        var e;
      }
      function l() {
        return "backend" !==
          {
            NODE_ENV: "production",
            PUBLIC_URL: "",
            WDS_SOCKET_HOST: void 0,
            WDS_SOCKET_PATH: void 0,
            WDS_SOCKET_PORT: void 0,
            FAST_REFRESH: !0,
          }.REACT_APP_DATA_PROVIDER
          ? ""
          : u()[0] || "";
      }
      function p(e) {
        const t = s(e);
        return t
          ? t.replace("https://", "wss://").replace("http://", "ws://")
          : "";
      }
      const _ = u(),
        m = l();
      p(m);
    },
  },
]);
//# sourceMappingURL=9752.048286cd.chunk.js.map

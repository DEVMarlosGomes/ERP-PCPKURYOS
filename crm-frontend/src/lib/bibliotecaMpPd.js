/* Biblioteca de matérias-primas do P&D (catálogo integrado + homologação + fornecedores) e a linha de
 * "novo ingrediente": tirada de pages/PDDetail.js para a aba Manipulação e o editor da manipulação em lote
 * usarem exatamente a mesma busca, os mesmos fornecedores/preços e a mesma MP nova. */
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { TIPOS_MP_PD } from "@/lib/materiaPrimaPd";
import { TIPOS_MP_NOVA } from "@/lib/fichaTecnica";
import { tipoMpNovaPeloContexto } from "@/lib/filaCadastroMp";

export const normalizeLookup = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function buildSupplierLookup(fornecedores = []) {
  const byId = new Map();
  const byName = new Map();

  fornecedores.forEach((fornecedor) => {
    if (fornecedor?.id) {
      byId.set(fornecedor.id, fornecedor);
    }
    [fornecedor?.razao_social, fornecedor?.nome_fantasia, fornecedor?.codigo_interno].forEach((candidate) => {
      const key = normalizeLookup(candidate);
      if (key && !byName.has(key)) {
        byName.set(key, fornecedor);
      }
    });
  });

  return { byId, byName };
}

export function normalizeSupplierOption(rawSupplier, lookup) {
  if (!rawSupplier) return null;

  const rawId = rawSupplier.fornecedor_id || rawSupplier.id || "";
  const rawName =
    rawSupplier.fornecedor_nome ||
    rawSupplier.nome ||
    rawSupplier.razao_social ||
    rawSupplier.nome_fantasia ||
    "";
  const matched =
    (rawId && lookup.byId.get(rawId)) ||
    lookup.byName.get(normalizeLookup(rawName)) ||
    {};

  const razaoSocial =
    matched.razao_social ||
    rawSupplier.razao_social ||
    rawSupplier.fornecedor_nome ||
    rawSupplier.nome ||
    matched.nome_fantasia ||
    rawSupplier.nome_fantasia ||
    "";

  if (!razaoSocial.trim()) return null;

  return {
    id: rawId || rawSupplier.codigo || rawSupplier.codigo_fornecedor || normalizeLookup(razaoSocial),
    nome: razaoSocial,
    razao_social: matched.razao_social || razaoSocial,
    nome_fantasia: matched.nome_fantasia || rawSupplier.nome_fantasia || "",
    codigo: rawSupplier.codigo || rawSupplier.codigo_fornecedor || matched.codigo_interno || "",
    moeda: String(rawSupplier.moeda || "BRL").toUpperCase(),
    preco_rs_kg:
      toFiniteNumber(rawSupplier.preco_rs_kg) ??
      toFiniteNumber(rawSupplier.preco_por_unidade) ??
      toFiniteNumber(rawSupplier.custo_referencia),
    unidade: rawSupplier.unidade || rawSupplier.unidade_compra || "kg",
    status:
      rawSupplier.status_homologacao ||
      rawSupplier.status ||
      matched?.homologacao?.status ||
      "",
  };
}

export function dedupeSupplierOptions(suppliers = []) {
  const byKey = new Map();

  suppliers.forEach((supplier) => {
    const normalized = normalizeSupplierOption(supplier, { byId: new Map(), byName: new Map() }) || supplier;
    const key = `${normalized.id || ""}:${normalizeLookup(normalized.razao_social || normalized.nome)}`;
    if (!key || key === ":") return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      return;
    }
    const existingPrice = toFiniteNumber(existing.preco_rs_kg);
    const nextPrice = toFiniteNumber(normalized.preco_rs_kg);
    if (existingPrice === null && nextPrice !== null) {
      byKey.set(key, { ...existing, ...normalized });
    }
  });

  return [...byKey.values()].sort((a, b) => {
    const priceA = toFiniteNumber(a.preco_rs_kg);
    const priceB = toFiniteNumber(b.preco_rs_kg);
    if (priceA !== null && priceB !== null && priceA !== priceB) return priceA - priceB;
    if (priceA !== null && priceB === null) return -1;
    if (priceA === null && priceB !== null) return 1;
    return (a.razao_social || a.nome || "").localeCompare(b.razao_social || b.nome || "", "pt-BR");
  });
}

export function buildSupplierDirectoryOptions(fornecedores = []) {
  const lookup = buildSupplierLookup(fornecedores);
  return dedupeSupplierOptions(
    fornecedores
      .map((fornecedor) =>
        normalizeSupplierOption(
          {
            id: fornecedor.id,
            razao_social: fornecedor.razao_social,
            nome_fantasia: fornecedor.nome_fantasia,
            codigo: fornecedor.codigo_interno,
            status: fornecedor?.homologacao?.status,
          },
          lookup,
        ),
      )
      .filter(Boolean),
  );
}

export function buildPdIngredientOptions({ catalog = [], materiais = [], homologacaoMps = [], fornecedores = [] }) {
  const supplierLookup = buildSupplierLookup(fornecedores);
  const optionsByKey = new Map();

  const ensureOption = ({
    key,
    nome,
    inci = "",
    codigo_interno = "",
    unidade = "kg",
    categoria = "",
    catalog_id = "",
    source = "",
    preco_rs_kg = null,
  }) => {
    if (!key || !nome) return null;
    const existing = optionsByKey.get(key) || {
      id: catalog_id || key,
      option_key: key,
      nome,
      inci: "",
      codigo_interno: "",
      unidade: "kg",
      categoria: "",
      catalog_id: "",
      preco_rs_kg: null,
      fornecedores: [],
      source_tags: [],
    };

    if (!existing.nome && nome) existing.nome = nome;
    if (!existing.inci && inci) existing.inci = inci;
    if (!existing.codigo_interno && codigo_interno) existing.codigo_interno = codigo_interno;
    if (!existing.categoria && categoria) existing.categoria = categoria;
    if ((!existing.unidade || existing.unidade === "kg") && unidade) existing.unidade = unidade;
    if (!existing.catalog_id && catalog_id) {
      existing.catalog_id = catalog_id;
      existing.id = catalog_id;
    }
    if (existing.preco_rs_kg === null && preco_rs_kg !== null) {
      existing.preco_rs_kg = preco_rs_kg;
    }
    if (source && !existing.source_tags.includes(source)) {
      existing.source_tags.push(source);
    }

    optionsByKey.set(key, existing);
    return existing;
  };

  catalog.forEach((item) => {
    const option = ensureOption({
      key: normalizeLookup(item.nome || item.inci || item.codigo_interno),
      nome: item.nome || item.inci || item.codigo_interno,
      inci: item.inci || "",
      codigo_interno: item.codigo_interno || "",
      unidade: item.unidade || "kg",
      categoria: item.categoria || "Catálogo",
      catalog_id: item.id || "",
      source: "catalogo",
      preco_rs_kg: toFiniteNumber(item.preco_rs_kg),
    });
    if (!option) return;
    (item.fornecedores || []).forEach((supplier) => {
      const normalized = normalizeSupplierOption(
        {
          nome: supplier.nome,
          codigo: supplier.codigo,
          preco_rs_kg: supplier.preco_rs_kg,
          moeda: supplier.moeda,
          unidade: item.unidade || "kg",
        },
        supplierLookup,
      );
      if (normalized) option.fornecedores.push(normalized);
    });
  });

  materiais.forEach((item) => {
    const option = ensureOption({
      key: normalizeLookup(item.nome || item.codigo_interno),
      nome: item.nome || item.codigo_interno,
      codigo_interno: item.codigo_interno || "",
      unidade: item.unidade_compra || item.unidade_estoque || "kg",
      categoria: item.subtipo || "Cadastro MP",
      source: "materiais",
    });
    if (!option) return;
    (item.fornecedores || []).forEach((supplier) => {
      const normalized = normalizeSupplierOption(
        {
          fornecedor_id: supplier.fornecedor_id,
          fornecedor_nome: supplier.fornecedor_nome,
          codigo_fornecedor: supplier.codigo_fornecedor,
          preco_por_unidade: supplier.preco_por_unidade,
          moeda: supplier.moeda,
          unidade_compra: supplier.unidade_compra || item.unidade_compra || item.unidade_estoque || "kg",
          status_homologacao: supplier.status_homologacao,
        },
        supplierLookup,
      );
      if (normalized) option.fornecedores.push(normalized);
    });
  });

  homologacaoMps.forEach((item) => {
    const option = ensureOption({
      key: normalizeLookup(item.nome || item.codigo_interno || item.inci),
      nome: item.nome || item.inci || item.codigo_interno,
      inci: item.inci || "",
      codigo_interno: item.codigo_interno || "",
      unidade: item.unidade || "kg",
      categoria: item.funcao || "Homologação",
      source: "homologacao",
      preco_rs_kg: toFiniteNumber(item.custo_referencia),
    });
    if (!option) return;
    if (item.fornecedor_id || item.fornecedor_nome) {
      const normalized = normalizeSupplierOption(
        {
          fornecedor_id: item.fornecedor_id,
          fornecedor_nome: item.fornecedor_nome,
          custo_referencia: item.custo_referencia,
          moeda: "BRL",
          unidade: item.unidade || "kg",
          status: item.status,
        },
        supplierLookup,
      );
      if (normalized) option.fornecedores.push(normalized);
    }
  });

  return [...optionsByKey.values()]
    .map((option) => ({
      ...option,
      fornecedores: dedupeSupplierOptions(option.fornecedores),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function findSupplierByName(suppliers = [], value = "") {
  const target = normalizeLookup(value);
  if (!target) return null;
  return (
    suppliers.find((supplier) => normalizeLookup(supplier.razao_social || supplier.nome) === target) ||
    suppliers.find((supplier) => normalizeLookup(supplier.nome_fantasia) === target) ||
    null
  );
}

export function usePdMaterialLibrary() {
  const [catalog, setCatalog] = useState([]);
  const [homologacaoMps, setHomologacaoMps] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);

  useEffect(() => {
    let active = true;

    (async () => {
      // PD-02: ingrediente é só MPES/MPGR. O /pd/catalog já é o cadastro integrado inteiro; a 2ª
      // leitura de /cadastros/materiais repetia as mesmas 5 coleções e era descartada (lia data.materiais).
      const [catalogResult, homologacaoResult, fornecedoresResult] = await Promise.allSettled([
        api.get("/pd/catalog", { params: { tipo_material: TIPOS_MP_PD.join(",") } }),
        api.get("/pd/homologacao/mps", { params: { tipo_mp: "FORMULACAO" } }),
        api.get("/compras/fornecedores", { params: { limit: 500 } }),
      ]);

      if (!active) return;

      setCatalog(
        catalogResult.status === "fulfilled" && Array.isArray(catalogResult.value?.data)
          ? catalogResult.value.data
          : [],
      );
      setHomologacaoMps(
        homologacaoResult.status === "fulfilled" && Array.isArray(homologacaoResult.value?.data)
          ? homologacaoResult.value.data
          : [],
      );
      setFornecedores(
        fornecedoresResult.status === "fulfilled" && Array.isArray(fornecedoresResult.value?.data?.fornecedores)
          ? fornecedoresResult.value.data.fornecedores
          : [],
      );
    })();

    return () => {
      active = false;
    };
  }, []);

  const supplierOptions = useMemo(() => buildSupplierDirectoryOptions(fornecedores), [fornecedores]);
  const ingredientOptions = useMemo(
    () => buildPdIngredientOptions({ catalog, homologacaoMps, fornecedores }),
    [catalog, homologacaoMps, fornecedores],
  );

  const getIngredientOption = useCallback(
    (ingredientName) => ingredientOptions.find((item) => item.option_key === normalizeLookup(ingredientName)) || null,
    [ingredientOptions],
  );

  const getSuppliersForIngredient = useCallback(
    (ingredientName) => {
      const ingredient = getIngredientOption(ingredientName);
      if (ingredient?.fornecedores?.length) {
        return ingredient.fornecedores;
      }
      return supplierOptions;
    },
    [getIngredientOption, supplierOptions],
  );

  return {
    catalog,
    ingredientOptions,
    supplierOptions,
    getIngredientOption,
    getSuppliersForIngredient,
  };
}

export const ITEM_VAZIO = { ingredient_name: "", percentage: "", price_per_kg: "", price_usd: "", price_currency: "BRL", fornecedor: "", phase: "", function: "", catalog_id: "", inci: "", mp_nova_on: false, mp_nova_nome: "", mp_nova_tipo: "" };
export const tipoMpNovaDoForm = (f) => (TIPOS_MP_NOVA[f?.mp_nova_tipo] ? f.mp_nova_tipo : tipoMpNovaPeloContexto(f));

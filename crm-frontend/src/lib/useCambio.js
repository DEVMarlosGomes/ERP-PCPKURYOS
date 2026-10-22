/* Dólar ao vivo nas telas (PLANO_PD_CRM_AJUSTES.md, Fase 5). Uma leitura de
 * /config/cambio compartilhada entre os componentes, renovada a cada 5 min. */
import { useEffect, useState } from "react";
import api from "@/lib/api";

const RENOVAR_MS = 5 * 60 * 1000;
let cache = null;
let lidoEm = 0;
let pendente = null;
const ouvintes = new Set();

export function carregarCambio(forcar = false) {
  if (!forcar && cache && Date.now() - lidoEm < RENOVAR_MS) return Promise.resolve(cache);
  if (pendente) return pendente;
  pendente = api.get("/config/cambio")
    .then(({ data }) => { cache = data; lidoEm = Date.now(); ouvintes.forEach((fn) => fn(cache)); return cache; })
    .catch(() => cache)
    .finally(() => { pendente = null; });
  return pendente;
}

export function publicarCambio(dados) {
  cache = dados;
  lidoEm = Date.now();
  ouvintes.forEach((fn) => fn(cache));
}

export function useCambio() {
  const [cambio, setCambio] = useState(cache);
  useEffect(() => {
    ouvintes.add(setCambio);
    carregarCambio();
    const t = setInterval(() => carregarCambio(true), RENOVAR_MS);
    return () => { ouvintes.delete(setCambio); clearInterval(t); };
  }, []);
  return cambio;
}

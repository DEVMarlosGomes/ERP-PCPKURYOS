// Vitrine dos prints da manipulação em lote: a config de sempre, com @/lib/api trocado pela API fictícia.
import { fileURLToPath, URL } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config.mjs";

export default mergeConfig(base, defineConfig({
  resolve: { alias: [{ find: /^@\/lib\/api$/, replacement: fileURLToPath(new URL("./src/test/vitrineLoteApi.js", import.meta.url)) }] },
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
}));

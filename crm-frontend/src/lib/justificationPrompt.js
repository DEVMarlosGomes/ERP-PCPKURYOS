/* Diálogo de justificativa para voltar um card.
 *
 * O adaptador responde 428 (JUSTIFICATIVA_REQUIRED) quando uma tela tenta
 * voltar um card sem justificativa. Em vez de reescrever cada quadro
 * (CRM1, CRM2, CRM3, P&D), o cliente da API abre este diálogo e repete a
 * chamada com o texto informado. Resolve null se a pessoa cancelar. */
import { MIN_JUSTIFICATIVA } from "@/lib/crmRules";

let openDialog = null;

export function askJustification(detail, { titulo = "Justifique o retorno do card", botao = "Voltar card" } = {}) {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (openDialog) return openDialog;
  openDialog = new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.setAttribute("data-kuryos-justification", "");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,12,30,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "kuryos-just-title");
    dialog.style.cssText = "width:min(480px,100%);border-radius:16px;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px 22px 18px;font-family:inherit";
    dialog.innerHTML = `
      <h2 id="kuryos-just-title" style="margin:0 0 6px;font-size:18px;font-weight:600;letter-spacing:-.015em">Justifique o retorno do card</h2>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:hsl(var(--muted-foreground))"></p>
      <label for="kuryos-just-text" style="display:block;margin-bottom:6px;font-size:13px;font-weight:600">Justificativa</label>
      <textarea id="kuryos-just-text" rows="4" style="width:100%;box-sizing:border-box;resize:vertical;border-radius:8px;border:1px solid hsl(var(--input));background:hsl(var(--background));color:inherit;padding:10px 12px;font:inherit;font-size:14px"></textarea>
      <div data-hint style="min-height:18px;margin-top:6px;font-size:12px;color:hsl(var(--muted-foreground))"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
        <button type="button" data-cancel style="min-height:38px;padding:0 14px;border-radius:8px;border:1px solid hsl(var(--border));background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer">Cancelar</button>
        <button type="button" data-confirm disabled style="min-height:38px;padding:0 16px;border-radius:8px;border:0;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font:inherit;font-weight:600;cursor:pointer;opacity:.5">Voltar card</button>
      </div>`;
    dialog.querySelector("h2").textContent = titulo;
    dialog.querySelector("[data-confirm]").textContent = botao;
    dialog.querySelector("p").textContent = `${detail || "Voltar um card exige justificativa."} Ela fica registrada no histórico.`;
    const textarea = dialog.querySelector("textarea");
    const confirm = dialog.querySelector("[data-confirm]");
    const hint = dialog.querySelector("[data-hint]");
    const update = () => {
      const size = textarea.value.trim().length;
      const ok = size >= MIN_JUSTIFICATIVA;
      confirm.disabled = !ok;
      confirm.style.opacity = ok ? "1" : ".5";
      hint.textContent = ok ? "" : `Mínimo de ${MIN_JUSTIFICATIVA} caracteres (${size}/${MIN_JUSTIFICATIVA}).`;
    };
    const close = (value) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      openDialog = null;
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); close(null); }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !confirm.disabled) close(textarea.value.trim());
    };
    textarea.addEventListener("input", update);
    dialog.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => close(textarea.value.trim()));
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(null); });
    document.addEventListener("keydown", onKey, true);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    update();
    textarea.focus();
  });
  return openDialog;
}

export function isJustificationRequired(error) {
  return error?.response?.status === 428 && error?.response?.data?.detail?.code === "JUSTIFICATIVA_REQUIRED";
}

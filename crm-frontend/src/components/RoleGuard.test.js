import { hasRole, ROLE_GROUPS } from "./RoleGuard";
import { effectiveRoles, isComercial } from "@/lib/crmRules";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

const { COMERCIAL_FULL, PD_FULL, ADMIN_ONLY } = ROLE_GROUPS;

describe("hasRole no PCP Kuryos", () => {
  test("papel listado e ADM continuam valendo", () => {
    expect(hasRole({ role: "vendedor" }, COMERCIAL_FULL)).toBe(true);
    expect(hasRole({ role: "admin" }, ADMIN_ONLY)).toBe(true);
    expect(hasRole({ role: "logistica" }, COMERCIAL_FULL)).toBe(false);
  });
  test("módulo Comercial abre telas do Comercial, qualquer que seja o papel", () => {
    expect(hasRole({ role: "logistica", modulos: { comercial: true } }, COMERCIAL_FULL)).toBe(true);
  });
  test("módulo Comercial não abre o que é só do ADM nem só do P&D", () => {
    expect(hasRole({ role: "logistica", modulos: { comercial: true } }, ADMIN_ONLY)).toBe(false);
    expect(hasRole({ role: "logistica", modulos: { comercial: true } }, ["admin", "lider_pd", "formulador"])).toBe(false);
  });
});

describe("funções do PCP (várias por usuário)", () => {
  test("Comercial e P&D viram os papéis do ERP", () => {
    expect(hasRole({ role: "comercial" }, COMERCIAL_FULL)).toBe(true);
    expect(hasRole({ role: "comercial" }, PD_FULL)).toBe(false);
    expect(hasRole({ role: "pd" }, PD_FULL)).toBe(true);
    expect(hasRole({ role: "pd" }, ["admin", "lider_pd"])).toBe(true);
    expect(isComercial({ role: "pd" })).toBe(false);
  });
  test("Comercial + P&D somam os acessos", () => {
    const user = { role: "comercial", funcoes: { comercial: true, pd: true } };
    expect(hasRole(user, COMERCIAL_FULL)).toBe(true);
    expect(hasRole(user, PD_FULL)).toBe(true);
    expect(hasRole(user, ADMIN_ONLY)).toBe(false);
    expect(isComercial(user)).toBe(true);
  });
  test("Gestor de Linha (RH) não é o gestor comercial do ERP", () => {
    expect(effectiveRoles({ role: "gestor" })).toEqual(["gestor_linha"]);
    expect(hasRole({ role: "gestor" }, COMERCIAL_FULL)).toBe(false);
    expect(isComercial({ role: "gestor" })).toBe(false);
  });
  test("Qualidade aprova a etapa CQ (qa) e Administrador em funcoes vale como ADM", () => {
    expect(hasRole({ role: "qualidade" }, ["admin", "qa"])).toBe(true);
    expect(hasRole({ role: "logistica", funcoes: { logistica: true, admin: true } }, ADMIN_ONLY)).toBe(true);
  });
});

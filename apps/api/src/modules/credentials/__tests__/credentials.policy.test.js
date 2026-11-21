import { describe, expect, it } from "@jest/globals";
import * as policy from "../credentials.policy.js";

const D1 = "d1";
const D2 = "d2";
const D3 = "d3";

const make = (role, departmentIds = [D1], id = `${role}-${departmentIds.join("-")}`) => ({
  id,
  role,
  departmentIds,
});

const admin = make("ADMINISTRATOR", []);
const gm = make("GENERAL_MANAGER", [D1, D2]);
const dm = make("DEPARTMENT_MANAGER", [D1]);
const sm = make("SCHEDULER_MANAGER", [D1]);
const volunteer = make("VOLUNTEER", [D1]);

const denied = (fn, status = 403) => {
  try {
    fn();
  } catch (error) {
    expect(error.statusCode).toBe(status);
    return;
  }
  throw new Error("esperava que a ação fosse negada");
};

describe("assertCanCreate", () => {
  it("administrador cria qualquer papel, respeitando a quantidade de departamentos", () => {
    expect(() => policy.assertCanCreate(admin, { role: "ADMINISTRATOR", departmentIds: [] })).not.toThrow();
    expect(() => policy.assertCanCreate(admin, { role: "GENERAL_MANAGER", departmentIds: [D1, D3] })).not.toThrow();
    expect(() => policy.assertCanCreate(admin, { role: "VOLUNTEER", departmentIds: [D3] })).not.toThrow();
    denied(() => policy.assertCanCreate(admin, { role: "VOLUNTEER", departmentIds: [D1, D2] }), 422);
    denied(() => policy.assertCanCreate(admin, { role: "ADMINISTRATOR", departmentIds: [D1] }), 422);
  });

  it("general manager cria até general manager, só nos próprios departamentos", () => {
    expect(() => policy.assertCanCreate(gm, { role: "GENERAL_MANAGER", departmentIds: [D1, D2] })).not.toThrow();
    expect(() => policy.assertCanCreate(gm, { role: "DEPARTMENT_MANAGER", departmentIds: [D2] })).not.toThrow();
    denied(() => policy.assertCanCreate(gm, { role: "ADMINISTRATOR", departmentIds: [] }));
    denied(() => policy.assertCanCreate(gm, { role: "GENERAL_MANAGER", departmentIds: [D1, D3] }));
    denied(() => policy.assertCanCreate(gm, { role: "VOLUNTEER", departmentIds: [D1, D2] }), 422);
  });

  it("department manager cria só scheduler manager ou voluntário no próprio departamento", () => {
    expect(() => policy.assertCanCreate(dm, { role: "SCHEDULER_MANAGER", departmentIds: [D1] })).not.toThrow();
    expect(() => policy.assertCanCreate(dm, { role: "VOLUNTEER", departmentIds: [D1] })).not.toThrow();
    denied(() => policy.assertCanCreate(dm, { role: "DEPARTMENT_MANAGER", departmentIds: [D1] }));
    denied(() => policy.assertCanCreate(dm, { role: "VOLUNTEER", departmentIds: [D2] }));
  });

  it("scheduler manager e voluntário não criam credenciais", () => {
    denied(() => policy.assertCanCreate(sm, { role: "VOLUNTEER", departmentIds: [D1] }));
    denied(() => policy.assertCanCreate(volunteer, { role: "VOLUNTEER", departmentIds: [D1] }));
  });
});

describe("assertCanDelete", () => {
  it("o próprio usuário pode se excluir", () => {
    expect(() => policy.assertCanDelete(volunteer, volunteer)).not.toThrow();
  });

  it("general manager exclui papéis abaixo dele nos seus departamentos", () => {
    expect(() => policy.assertCanDelete(gm, dm)).not.toThrow();
    denied(() => policy.assertCanDelete(gm, make("VOLUNTEER", [D3])));
    denied(() => policy.assertCanDelete(gm, make("GENERAL_MANAGER", [D1], "outro-gm")));
  });

  it("department manager não exclui outras credenciais", () => {
    denied(() => policy.assertCanDelete(dm, volunteer));
  });
});

describe("assertCanRegenerateNumber", () => {
  it("permite o próprio usuário e department manager+ no escopo", () => {
    expect(() => policy.assertCanRegenerateNumber(volunteer, volunteer)).not.toThrow();
    expect(() => policy.assertCanRegenerateNumber(dm, volunteer)).not.toThrow();
    denied(() => policy.assertCanRegenerateNumber(sm, volunteer));
    denied(() => policy.assertCanRegenerateNumber(dm, make("VOLUNTEER", [D2])));
  });
});

describe("assertCanChangeRole", () => {
  it("department manager promove a scheduler manager, mas não ao próprio nível", () => {
    expect(() => policy.assertCanChangeRole(dm, volunteer, "SCHEDULER_MANAGER", [D1])).not.toThrow();
    denied(() => policy.assertCanChangeRole(dm, volunteer, "DEPARTMENT_MANAGER", [D1]));
  });

  it("general manager promove a general manager com departamentos que ele possui", () => {
    expect(() => policy.assertCanChangeRole(gm, dm, "GENERAL_MANAGER", [D1, D2])).not.toThrow();
    denied(() => policy.assertCanChangeRole(gm, dm, "GENERAL_MANAGER", [D1, D3]));
  });

  it("ninguém altera o próprio papel", () => {
    denied(() => policy.assertCanChangeRole(gm, gm, "VOLUNTEER", [D1]));
  });
});

describe("assertCanTransfer", () => {
  it("é imediata quando o destino também é do general manager", () => {
    expect(policy.assertCanTransfer(gm, volunteer, { fromDepartmentId: D1, toDepartmentId: D2 })).toEqual({
      immediate: true,
    });
  });

  it("fica pendente quando o destino não é do general manager", () => {
    expect(policy.assertCanTransfer(gm, volunteer, { fromDepartmentId: D1, toDepartmentId: D3 })).toEqual({
      immediate: false,
    });
  });

  it("exige que a origem seja um departamento do general manager e da credencial", () => {
    denied(() => policy.assertCanTransfer(gm, make("VOLUNTEER", [D3]), { fromDepartmentId: D3, toDepartmentId: D1 }));
    denied(
      () => policy.assertCanTransfer(gm, volunteer, { fromDepartmentId: D2, toDepartmentId: D3 }),
      422,
    );
  });

  it("department manager não transfere", () => {
    denied(() => policy.assertCanTransfer(dm, volunteer, { fromDepartmentId: D1, toDepartmentId: D2 }));
  });
});

describe("assertCanReviewTransfer", () => {
  it("apenas general manager do destino (ou administrador) revisa", () => {
    expect(() => policy.assertCanReviewTransfer(make("GENERAL_MANAGER", [D3], "gm3"), D3)).not.toThrow();
    expect(() => policy.assertCanReviewTransfer(admin, D3)).not.toThrow();
    denied(() => policy.assertCanReviewTransfer(gm, D3));
    denied(() => policy.assertCanReviewTransfer(make("DEPARTMENT_MANAGER", [D3]), D3));
  });
});

describe("assertCanChangeStatus", () => {
  const active = { ...volunteer, status: "ACTIVE" };
  const inactive = { ...volunteer, status: "INACTIVE" };

  it("o próprio usuário pode se desativar, mas não se reativar", () => {
    expect(() => policy.assertCanChangeStatus(active, active, "INACTIVE")).not.toThrow();
    denied(() => policy.assertCanChangeStatus(inactive, inactive, "ACTIVE"));
  });

  it("general manager desativa e reativa quem gerencia", () => {
    expect(() => policy.assertCanChangeStatus(gm, active, "INACTIVE")).not.toThrow();
    expect(() => policy.assertCanChangeStatus(gm, inactive, "ACTIVE")).not.toThrow();
    denied(() => policy.assertCanChangeStatus(dm, active, "INACTIVE"));
  });

  it("recusa status repetido e credencial pendente", () => {
    denied(() => policy.assertCanChangeStatus(gm, active, "ACTIVE"), 409);
    denied(() => policy.assertCanChangeStatus(gm, { ...volunteer, status: "PENDING" }, "INACTIVE"), 409);
  });
});

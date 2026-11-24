import { describe, expect, jest, test } from "@jest/globals";

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/midiasbn_test";
process.env.JWT_SECRET ??= "test-jwt-secret-with-more-than-32-characters";
process.env.CREDENTIAL_NUMBER_SECRET ??= "test-credential-secret-with-more-than-32-characters";

jest.mock("jose", () => ({
  SignJWT: class MockSignJWT {
    setProtectedHeader() {
      return this;
    }
    setSubject(sub) {
      this.sub = sub;
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return `mock-jwt:${this.sub ?? ""}`;
    }
  },
  jwtVerify: async (token) => {
    const [, sub] = String(token).split(":");
    return { payload: { sub, sid: "session-1" } };
  },
}));

const {
  ROLES,
  ROLE_LIST,
  ASSIGNABLE_ROLE_LIST,
  rankOf,
  isAtLeast,
  isDeveloper,
  isAdmin,
} = require("../../../shared/auth/roles.js");
const policy = require("../../credentials/credentials.policy.js");
const { generateCredentialNumber } = require("../../credentials/credential-number.js");
const { createCredentialsService } = require("../../credentials/credentials.service.js");
const { createSystemService, systemService } = require("../system.service.js");
const { createAuthService } = require("../../auth/auth.service.js");
const { hashToken } = require("../../../shared/auth/tokens.js");
const { authenticate } = require("../../../shared/middlewares/authenticate.js");
const { credentialsRepository } = require("../../credentials/credentials.repository.js");
const { sessionsRepository } = require("../../sessions/sessions.repository.js");

const makeActor = (role, id = `user-${role.toLowerCase()}`, departmentIds = []) => ({
  id,
  role,
  status: "ACTIVE",
  departmentIds,
});

describe("DEVELOPER role and hierarchy", () => {
  test("ranks DEVELOPER strictly above ADMINISTRATOR and keeps it non-assignable", () => {
    expect(ROLES.DEVELOPER).toBe("DEVELOPER");
    expect(ROLE_LIST).toContain(ROLES.DEVELOPER);
    expect(ASSIGNABLE_ROLE_LIST).not.toContain(ROLES.DEVELOPER);
    expect(rankOf(ROLES.DEVELOPER)).toBeGreaterThan(rankOf(ROLES.ADMINISTRATOR));
    expect(isAtLeast(ROLES.DEVELOPER, ROLES.ADMINISTRATOR)).toBe(true);
    expect(isAtLeast(ROLES.ADMINISTRATOR, ROLES.DEVELOPER)).toBe(false);

    const dev = makeActor(ROLES.DEVELOPER);
    const admin = makeActor(ROLES.ADMINISTRATOR);
    const volunteer = makeActor(ROLES.VOLUNTEER, "vol-1", ["dept-1"]);

    expect(isDeveloper(dev)).toBe(true);
    expect(isDeveloper(admin)).toBe(false);
    expect(isAdmin(dev)).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(volunteer)).toBe(false);
  });

  test("credentials policy enforces DEVELOPER superiority and total invisibility", () => {
    const dev = makeActor(ROLES.DEVELOPER, "dev-1");
    const admin = makeActor(ROLES.ADMINISTRATOR, "admin-1");
    const volunteer = makeActor(ROLES.VOLUNTEER, "vol-1", ["dept-1"]);

    expect(policy.canManage(dev, admin)).toBe(true);
    expect(policy.canManage(admin, dev)).toBe(false);
    expect(() => policy.assertCanCreate(dev, { role: ROLES.ADMINISTRATOR, departmentIds: [] })).not.toThrow();
    expect(() => policy.assertCanCreate(dev, { role: ROLES.DEVELOPER, departmentIds: [] })).toThrow(
      /não pode atribuir/i,
    );
    expect(() => policy.assertDepartmentCount(ROLES.DEVELOPER, ["dept-1"])).toThrow(/não pertencem a ministérios/i);
    expect(() => policy.assertDepartmentCount(ROLES.DEVELOPER, [])).not.toThrow();

    expect(() => policy.assertCanView(dev, dev)).not.toThrow();
    expect(() => policy.assertCanViewMember(dev, dev)).not.toThrow();

    try {
      policy.assertCanView(admin, dev);
      throw new Error("Expected assertCanView to throw");
    } catch (err) {
      expect(err.statusCode).toBe(404);
    }

    try {
      policy.assertCanViewMember(admin, dev);
      throw new Error("Expected assertCanViewMember to throw");
    } catch (err) {
      expect(err.statusCode).toBe(404);
    }

    try {
      policy.assertCanViewMember(volunteer, dev);
      throw new Error("Expected assertCanViewMember to throw for volunteer");
    } catch (err) {
      expect(err.statusCode).toBe(404);
    }

    expect(() => policy.assertCanDelete(admin, dev)).toThrow(/não pode ser excluída/i);
    expect(() => policy.assertCanDelete(dev, dev)).toThrow(/não pode ser excluída/i);
    expect(() => policy.assertCanChangeStatus(admin, dev, "INACTIVE")).toThrow(/não pode ser alterado/i);
    expect(() => policy.assertCanChangeStatus(dev, dev, "INACTIVE")).toThrow(/não pode ser alterado/i);
    expect(() => policy.assertCanSetDepartments(admin, dev, [])).toThrow(/não pertence a ministérios/i);
  });
});

describe("SystemService and Maintenance Mode", () => {
  function createMockSystem(initial = false) {
    let state = { maintenanceMode: initial, updatedAt: null };
    const repository = {
      async getConfig() {
        return state;
      },
      async setMaintenanceMode(maintenanceMode) {
        state = { maintenanceMode, updatedAt: new Date("2026-11-24T00:00:00.000Z") };
        return state;
      },
    };
    return createSystemService({ repository });
  }

  test("only DEVELOPER can read or update system config while status is public", async () => {
    const service = createMockSystem(false);
    const dev = makeActor(ROLES.DEVELOPER);
    const admin = makeActor(ROLES.ADMINISTRATOR);
    const volunteer = makeActor(ROLES.VOLUNTEER, "vol-1", ["dept-1"]);

    await expect(service.getStatus()).resolves.toEqual({ maintenanceMode: false });

    await expect(service.getConfig(admin)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.getConfig(volunteer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.updateConfig(admin, { maintenanceMode: true })).rejects.toMatchObject({ statusCode: 403 });

    await expect(service.getConfig(dev)).resolves.toEqual({ maintenanceMode: false, updatedAt: null });
    const updated = await service.updateConfig(dev, { maintenanceMode: true });
    expect(updated.maintenanceMode).toBe(true);
    expect(updated.updatedAt).toBeInstanceOf(Date);
    await expect(service.getStatus()).resolves.toEqual({ maintenanceMode: true });
  });

  test("authService blocks login and refresh for non-developers during maintenance mode", async () => {
    const dev = makeActor(ROLES.DEVELOPER, "11111111-1111-4111-8111-111111111111");
    const admin = makeActor(ROLES.ADMINISTRATOR, "22222222-2222-4222-8222-222222222222");
    const volunteer = makeActor(ROLES.VOLUNTEER, "33333333-3333-4333-8333-333333333333");

    const byCode = {
      "DEV-2222222222": { ...dev, name: "Dev", username: "dev" },
      "SBN-ADMIN": { ...admin, name: "Admin", username: "admin" },
      "SBN-VOL": { ...volunteer, name: "Vol", username: "vol" },
    };

    const byTokenCredential = {
      "rt-dev": byCode["DEV-2222222222"],
      "rt-admin": byCode["SBN-ADMIN"],
      "rt-vol": byCode["SBN-VOL"],
    };

    let maintenance = true;
    const system = {
      async isMaintenanceMode() {
        return maintenance;
      },
    };

    const repository = {
      async findCredentialByNumber(credentialNumber) {
        return byCode[credentialNumber] ?? null;
      },
      async openSession() {
        return "session-1";
      },
      async findRefreshToken(tokenHash) {
        const entry = Object.entries(byTokenCredential).find(([key]) => tokenHash === key);
        if (!entry) return null;
        return {
          id: "session-1",
          tokenHash: entry[0],
          expiresAt: new Date(Date.now() + 60_000),
          credential: entry[1],
        };
      },
      async rotateRefreshToken() {
        return true;
      },
      async deleteRefreshToken() {},
    };

    const auth = createAuthService({ repository, system });

    await expect(auth.login({ credentialNumber: "SBN-VOL" }, { userAgent: "jest" })).rejects.toMatchObject({
      statusCode: 503,
      details: { code: "MAINTENANCE_MODE" },
    });
    await expect(auth.login({ credentialNumber: "SBN-ADMIN" }, { userAgent: "jest" })).rejects.toMatchObject({
      statusCode: 503,
      details: { code: "MAINTENANCE_MODE" },
    });

    const devSession = await auth.login({ credentialNumber: "DEV-2222222222" }, { userAgent: "jest" });
    expect(devSession.credential.role).toBe(ROLES.DEVELOPER);
    expect(devSession.accessToken).toEqual(expect.any(String));

    maintenance = false;
    const volSession = await auth.login({ credentialNumber: "SBN-VOL" }, { userAgent: "jest" });
    expect(volSession.credential.role).toBe(ROLES.VOLUNTEER);
    const adminSession = await auth.login({ credentialNumber: "SBN-ADMIN" }, { userAgent: "jest" });
    expect(adminSession.credential.role).toBe(ROLES.ADMINISTRATOR);
  });

  test("authService blocks refresh tokens for non-developers during maintenance mode", async () => {
    const dev = { ...makeActor(ROLES.DEVELOPER, "11111111-1111-4111-8111-111111111111"), name: "Dev", username: "dev" };
    const admin = {
      ...makeActor(ROLES.ADMINISTRATOR, "22222222-2222-4222-8222-222222222222"),
      name: "Admin",
      username: "admin",
    };
    const volunteer = {
      ...makeActor(ROLES.VOLUNTEER, "33333333-3333-4333-8333-333333333333"),
      name: "Vol",
      username: "vol",
    };

    const byHash = new Map([
      [hashToken("dev-token"), dev],
      [hashToken("admin-token"), admin],
      [hashToken("vol-token"), volunteer],
    ]);

    const auth = createAuthService({
      repository: {
        async findRefreshToken(tokenHash) {
          const credential = byHash.get(tokenHash);
          if (!credential) return null;
          return {
            id: "session-1",
            tokenHash,
            expiresAt: new Date(Date.now() + 60_000),
            credential,
          };
        },
        async rotateRefreshToken() {
          return true;
        },
        async deleteRefreshToken() {},
      },
      system: {
        async isMaintenanceMode() {
          return true;
        },
      },
    });

    await expect(auth.refresh({ refreshToken: "vol-token" })).rejects.toMatchObject({
      statusCode: 503,
      details: { code: "MAINTENANCE_MODE" },
    });
    await expect(auth.refresh({ refreshToken: "admin-token" })).rejects.toMatchObject({
      statusCode: 503,
      details: { code: "MAINTENANCE_MODE" },
    });

    const refreshedDev = await auth.refresh({ refreshToken: "dev-token" });
    expect(refreshedDev.credential.role).toBe(ROLES.DEVELOPER);
    expect(refreshedDev.accessToken).toEqual(expect.any(String));
  });

  test("authenticate middleware blocks active non-developer sessions during maintenance mode", async () => {
    const dev = makeActor(ROLES.DEVELOPER, "dev-auth-id");
    const admin = makeActor(ROLES.ADMINISTRATOR, "admin-auth-id");

    const findAuthSpy = jest.spyOn(credentialsRepository, "findAuthById").mockImplementation(async (id) => {
      if (id === dev.id) return dev;
      if (id === admin.id) return admin;
      return null;
    });
    const sessionSpy = jest.spyOn(sessionsRepository, "isOpen").mockResolvedValue(true);
    const maintSpy = jest.spyOn(systemService, "isMaintenanceMode").mockResolvedValue(true);

    try {
      const adminReq = { headers: { authorization: `Bearer mock-jwt:${admin.id}` } };
      await expect(authenticate(adminReq, {}, () => {})).rejects.toMatchObject({
        statusCode: 503,
        details: { code: "MAINTENANCE_MODE" },
      });

      const devReq = { headers: { authorization: `Bearer mock-jwt:${dev.id}` } };
      const next = jest.fn();
      await expect(authenticate(devReq, {}, next)).resolves.toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
      expect(devReq.auth).toMatchObject({ id: dev.id, role: ROLES.DEVELOPER, sessionId: "session-1" });
    } finally {
      findAuthSpy.mockRestore();
      sessionSpy.mockRestore();
      maintSpy.mockRestore();
    }
  });
});

describe("DEVELOPER credential code prefix", () => {
  test("generateCredentialNumber uses DEV- only for DEVELOPER and SBN- otherwise", () => {
    expect(generateCredentialNumber(ROLES.DEVELOPER)).toMatch(/^DEV-[A-HJKMNP-Z2-9]{10}$/);
    expect(generateCredentialNumber(ROLES.ADMINISTRATOR)).toMatch(/^SBN-[A-HJKMNP-Z2-9]{10}$/);
    expect(generateCredentialNumber()).toMatch(/^SBN-[A-HJKMNP-Z2-9]{10}$/);
  });

  test("credentialsService issues DEV- codes for DEVELOPER and SBN- codes for other roles", async () => {
    const dev = { ...makeActor(ROLES.DEVELOPER, "dev-1"), sessionId: "session-dev", name: "Dev", username: "dev" };
    const admin = {
      ...makeActor(ROLES.ADMINISTRATOR, "admin-1"),
      sessionId: "session-admin",
      name: "Admin",
      username: "admin",
    };

    const repository = {
      async findById(id) {
        if (id === dev.id) return dev;
        if (id === admin.id) return admin;
        return null;
      },
      async isCredentialNumberTaken() {
        return false;
      },
      async rotateHashedNumber() {
        return "session-rotated";
      },
      async create({ name, role, credentialNumber, departmentIds }) {
        return {
          id: "created-1",
          name,
          role,
          status: "PENDING",
          credentialNumber,
          departmentIds,
          departments: [],
        };
      },
    };

    const service = createCredentialsService({ repository });

    const devActivation = await service.prepareActivationCode(dev);
    expect(devActivation.credentialNumber).toMatch(/^DEV-[A-HJKMNP-Z2-9]{10}$/);

    const adminActivation = await service.prepareActivationCode(admin);
    expect(adminActivation.credentialNumber).toMatch(/^SBN-[A-HJKMNP-Z2-9]{10}$/);

    const devRotated = await service.regenerateCredentialNumber(dev, dev.id, { userAgent: "jest" });
    expect(devRotated.credentialNumber).toMatch(/^DEV-[A-HJKMNP-Z2-9]{10}$/);

    const createdAdmin = await service.create(dev, {
      name: "Novo Admin",
      role: ROLES.ADMINISTRATOR,
      departmentIds: [],
    });
    expect(createdAdmin.credentialNumber).toMatch(/^SBN-[A-HJKMNP-Z2-9]{10}$/);
  });
});

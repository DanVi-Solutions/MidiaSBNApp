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
    setSubject() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return "mock-jwt";
    }
  },
  jwtVerify: async () => ({ payload: {} }),
}));

const { ROLES, hasScheduleManagementRole, hasDemandManagementRole } = require("../../../shared/auth/roles.js");
const credentialsPolicy = require("../../credentials/credentials.policy.js");
const { purgeExpiredCompletedDemands } = require("../demands.cleanup.js");
const { toDemand } = require("../demands.repository.js");
const { createDemandsService } = require("../demands.service.js");

const makeActor = (role, id, departmentIds = []) => ({
  id,
  name: id,
  username: id,
  role,
  status: "ACTIVE",
  departmentIds,
});

describe("Simplified roles after removing DEMAND_MANAGER", () => {
  test("removes dedicated demand manager roles and leaves moderation with DEPARTMENT_MANAGER+", () => {
    expect(ROLES.DEMAND_MANAGER).toBeUndefined();
    expect(ROLES.SCHEDULER_DEMAND_MANAGER).toBeUndefined();

    expect(hasScheduleManagementRole(ROLES.SCHEDULER_MANAGER)).toBe(true);
    expect(hasDemandManagementRole(ROLES.SCHEDULER_MANAGER)).toBe(false);
    expect(hasDemandManagementRole(ROLES.VOLUNTEER)).toBe(false);

    expect(hasDemandManagementRole(ROLES.DEPARTMENT_MANAGER)).toBe(true);
    expect(hasDemandManagementRole(ROLES.GENERAL_MANAGER)).toBe(true);
    expect(hasDemandManagementRole(ROLES.ADMINISTRATOR)).toBe(true);
    expect(hasDemandManagementRole(ROLES.DEVELOPER)).toBe(true);

    const deptMgr = makeActor(ROLES.DEPARTMENT_MANAGER, "mgr-1", ["dept-1"]);
    expect(() =>
      credentialsPolicy.assertCanCreate(deptMgr, { role: ROLES.SCHEDULER_MANAGER, departmentIds: ["dept-1"] }),
    ).not.toThrow();
    expect(() =>
      credentialsPolicy.assertCanCreate(deptMgr, { role: ROLES.DEPARTMENT_MANAGER, departmentIds: ["dept-1"] }),
    ).toThrow(/não pode atribuir/i);
  });
});

describe("demandsService multi-assignee, due-date >= today, silent 15-day purge, and notifications", () => {
  function setupDemandsFixture(initialNowIso = "2026-11-24T15:00:00.000Z") {
    let currentNow = new Date(initialNowIso);

    const departments = new Map([
      ["dept-media", { id: "dept-media", name: "Mídia", hasDemands: true }],
      ["dept-audio", { id: "dept-audio", name: "Áudio", hasDemands: true }],
      ["dept-louvor", { id: "dept-louvor", name: "Louvor", hasDemands: false }],
    ]);

    const people = new Map([
      ["dev-1", makeActor(ROLES.DEVELOPER, "dev-1")],
      ["admin-1", makeActor(ROLES.ADMINISTRATOR, "admin-1")],
      ["admin-2", makeActor(ROLES.ADMINISTRATOR, "admin-2")],
      ["gm-1", makeActor(ROLES.GENERAL_MANAGER, "gm-1", ["dept-media", "dept-audio"])],
      ["gm-2", makeActor(ROLES.GENERAL_MANAGER, "gm-2", ["dept-media"])],
      ["mgr-media", makeActor(ROLES.DEPARTMENT_MANAGER, "mgr-media", ["dept-media"])],
      ["sched-media", makeActor(ROLES.SCHEDULER_MANAGER, "sched-media", ["dept-media"])],
      ["vol-media-1", makeActor(ROLES.VOLUNTEER, "vol-media-1", ["dept-media"])],
      ["vol-media-2", makeActor(ROLES.VOLUNTEER, "vol-media-2", ["dept-media"])],
      ["vol-audio", makeActor(ROLES.VOLUNTEER, "vol-audio", ["dept-audio"])],
    ]);

    const stored = new Map();
    const sentNotifications = [];
    let seq = 1;

    const repository = {
      async list({ departmentIds, departmentId, status } = {}) {
        return [...stored.values()].filter((row) => {
          if (!row.department.hasDemands) return false;
          if (departmentId && row.department.id !== departmentId) return false;
          if (departmentIds && !departmentId && !departmentIds.includes(row.department.id)) return false;
          if (status && row.status !== status) return false;
          return true;
        });
      },
      async findById(id) {
        return stored.get(id) ?? null;
      },
      async findDepartment(id) {
        return departments.get(id) ?? null;
      },
      async findCandidateById(id) {
        return people.get(id) ?? null;
      },
      async listDepartmentCandidates(departmentId) {
        return [...people.values()]
          .filter(
            (person) =>
              person.status !== "INACTIVE" &&
              person.departmentIds.includes(departmentId) &&
              ![ROLES.DEVELOPER, ROLES.ADMINISTRATOR, ROLES.GENERAL_MANAGER].includes(person.role),
          )
          .map(({ id, name, username, role }) => ({ id, name, username, role }));
      },
      async create({ assigneeIds = [], ...data }) {
        const id = `demand-${seq++}`;
        const created = toDemand({
          id,
          title: data.title,
          description: data.description ?? null,
          status: data.status,
          dueAt: data.dueAt ?? null,
          completedAt: data.completedAt ?? null,
          createdAt: new Date(currentNow),
          updatedAt: new Date(currentNow),
          department: departments.get(data.departmentId),
          assignees: assigneeIds.map((uid) => ({ credential: people.get(uid) })).filter((a) => a.credential),
          createdBy: data.createdById ? people.get(data.createdById) : null,
        });
        stored.set(id, created);
        return created;
      },
      async update(id, { assigneeIds, ...data }) {
        const prev = stored.get(id);
        const updated = toDemand({
          ...prev,
          ...data,
          assignees:
            assigneeIds === undefined
              ? prev.assignees.map((p) => ({ credential: p }))
              : assigneeIds.map((uid) => ({ credential: people.get(uid) })).filter((a) => a.credential),
          updatedAt: new Date(currentNow),
        });
        stored.set(id, updated);
        return updated;
      },
      async delete(id) {
        stored.delete(id);
      },
      async deleteCompletedBefore(cutoff) {
        let deleted = 0;
        for (const [id, row] of stored.entries()) {
          if (
            row.status === "COMPLETED" &&
            row.completedAt &&
            new Date(row.completedAt).getTime() <= cutoff.getTime()
          ) {
            stored.delete(id);
            deleted += 1;
          }
        }
        return deleted;
      },
    };

    const notifier = {
      async safely(task) {
        await task();
      },
      async to(ids, message, options = {}) {
        const recipients = [...new Set(ids)].filter((id) => id && id !== options.except);
        if (recipients.length > 0) {
          sentNotifications.push({ recipients, message });
        }
        return recipients;
      },
    };

    const recipients = {
      async departmentLeadersOf(departmentId) {
        return [...people.values()]
          .filter(
            (p) =>
              p.departmentIds.includes(departmentId) &&
              [ROLES.DEPARTMENT_MANAGER, ROLES.GENERAL_MANAGER].includes(p.role),
          )
          .map((p) => p.id);
      },
    };

    return {
      service: createDemandsService({
        repository,
        notifier,
        recipients,
        now: () => currentNow,
        timeZone: "America/Sao_Paulo",
      }),
      repository,
      people,
      sentNotifications,
      setNow(iso) {
        currentNow = new Date(iso);
      },
      getNow() {
        return currentNow;
      },
    };
  }

  test("supports 1 or more assignees and collaborative volunteer rules", async () => {
    const { service, people, sentNotifications } = setupDemandsFixture();
    const mgrMedia = people.get("mgr-media");
    const sched = people.get("sched-media");
    const vol1 = people.get("vol-media-1");
    const vol2 = people.get("vol-media-2");
    const volAudio = people.get("vol-audio");

    await expect(
      service.create(volAudio, { title: "Outro ministério", departmentId: "dept-media" }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.create(mgrMedia, {
        title: "Já finalizada na criação",
        departmentId: "dept-media",
        assigneeIds: [vol1.id],
        status: "COMPLETED",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    // Vol1 creates a demand with TWO assignees: sched and vol2
    const demand = await service.create(vol1, {
      title: "Transmitir culto",
      departmentId: "dept-media",
      assigneeIds: [sched.id, vol2.id],
    });
    expect(demand.status).toBe("IN_PROGRESS");
    expect(demand.assignees.map((p) => p.id).sort()).toEqual(["sched-media", "vol-media-2"]);
    expect(sentNotifications.at(-1)).toMatchObject({
      recipients: ["sched-media", "vol-media-2"],
      message: { type: "DEMAND_ASSIGNED", link: "/demands" },
    });

    // Creator (vol1, not one of the assignees) cannot finalize while others are assigned
    await expect(service.update(vol1, demand.id, { status: "COMPLETED" })).rejects.toMatchObject({ statusCode: 403 });

    // Either assigned person (sched) can edit and finalize, cannot delete
    await expect(service.delete(sched, demand.id)).rejects.toMatchObject({ statusCode: 403 });
    const completed = await service.update(sched, demand.id, {
      description: "Câmeras ajustadas",
      status: "COMPLETED",
    });
    expect(completed.status).toBe("COMPLETED");
    expect(sentNotifications.at(-1).message.type).toBe("DEMAND_COMPLETED");
    expect(sentNotifications.at(-1).recipients).toEqual(
      expect.arrayContaining(["vol-media-1", "vol-media-2", "mgr-media", "gm-1"]),
    );

    // Creator cannot reopen another assignee's completed demand, while vol2 (co-assignee) can
    await expect(service.update(vol1, demand.id, { status: "IN_PROGRESS" })).rejects.toMatchObject({
      statusCode: 403,
    });
    const reopened = await service.update(vol2, demand.id, { status: "IN_PROGRESS" });
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.completedAt).toBeNull();

    // Creator can update title and reassign team: remove sched, add vol1
    const reassigned = await service.update(vol1, demand.id, {
      title: "Transmissão domingo",
      assigneeIds: [vol1.id, vol2.id],
    });
    expect(reassigned.assignees.map((p) => p.id).sort()).toEqual(["vol-media-1", "vol-media-2"]);
    expect(sentNotifications.some((n) => n.message.type === "DEMAND_UNASSIGNED" && n.recipients.includes("sched-media"))).toBe(true);
    expect(sentNotifications.some((n) => n.message.type === "DEMAND_UPDATED" && n.recipients.includes("vol-media-2"))).toBe(true);

    // Creator can delete their own demand
    await expect(service.delete(vol1, demand.id)).resolves.toBeUndefined();
    expect(sentNotifications.at(-1)).toMatchObject({
      recipients: ["vol-media-2"],
      message: { type: "DEMAND_DELETED" },
    });
  });

  test("rejects past dueAt on create and change, while permitting today and unchanged past deadlines", async () => {
    const { service, people, setNow } = setupDemandsFixture("2026-11-24T15:00:00.000Z");
    const vol1 = people.get("vol-media-1");

    await expect(
      service.create(vol1, {
        title: "Prazo ontem",
        departmentId: "dept-media",
        dueAt: "2026-11-23T23:59:00-03:00",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    const createdToday = await service.create(vol1, {
      title: "Prazo hoje",
      departmentId: "dept-media",
      dueAt: "2026-11-24T23:59:00-03:00",
    });
    expect(createdToday.dueAt).toBe("2026-11-24T23:59:00-03:00");

    // Advance clock 2 days (now 2026-11-26); unchanged dueAt still allows editing title
    setNow("2026-11-26T15:00:00.000Z");
    const updatedTitleOnly = await service.update(vol1, createdToday.id, {
      title: "Título ajustado",
      dueAt: "2026-11-24T23:59:00-03:00",
    });
    expect(updatedTitleOnly.title).toBe("Título ajustado");

    // Changing dueAt to a past date relative to 2026-11-26 fails
    await expect(
      service.update(vol1, createdToday.id, { dueAt: "2026-11-25T23:59:00-03:00" }),
    ).rejects.toMatchObject({ statusCode: 422 });

    // Changing dueAt to >= today (2026-11-26) succeeds
    const pushedDue = await service.update(vol1, createdToday.id, { dueAt: "2026-11-26T23:59:00-03:00" });
    expect(pushedDue.dueAt).toBe("2026-11-26T23:59:00-03:00");
  });

  test("silently deletes finalized demands after 15 days and resets the 15-day timer if reopened and re-finalized", async () => {
    const { service, repository, people, sentNotifications, setNow, getNow } = setupDemandsFixture(
      "2026-11-01T12:00:00.000Z",
    );
    const mgrMedia = people.get("mgr-media");
    const vol1 = people.get("vol-media-1");

    const d1 = await service.create(vol1, {
      title: "Entrega definitiva",
      departmentId: "dept-media",
      assigneeIds: [vol1.id],
    });
    const d2 = await service.create(vol1, {
      title: "Entrega reaberta depois",
      departmentId: "dept-media",
      assigneeIds: [vol1.id],
    });

    await service.update(vol1, d1.id, { status: "COMPLETED" });
    await service.update(vol1, d2.id, { status: "COMPLETED" });

    // Day 10: reopen d2 -> clears timer
    setNow("2026-11-11T12:00:00.000Z");
    const reopenedD2 = await service.update(vol1, d2.id, { status: "IN_PROGRESS" });
    expect(reopenedD2.completedAt).toBeNull();

    // Day 14h23m after completion of d1: still exists
    setNow("2026-11-16T11:59:00.000Z");
    expect(await purgeExpiredCompletedDemands({ repository, now: getNow() })).toBe(0);
    expect((await service.list(mgrMedia)).map((d) => d.id)).toEqual([d1.id, d2.id]);

    // Exactly 15 days after completion of d1: silently destroyed, zero delete notification
    setNow("2026-11-16T12:00:00.000Z");
    const countBefore = sentNotifications.length;
    expect(await purgeExpiredCompletedDemands({ repository, now: getNow() })).toBe(1);
    expect(sentNotifications.length).toBe(countBefore);
    await expect(service.getById(mgrMedia, d1.id)).rejects.toMatchObject({ statusCode: 404 });

    // d2 (reopened) survives well past 15 days since original completion
    setNow("2026-11-20T12:00:00.000Z");
    expect(await purgeExpiredCompletedDemands({ repository, now: getNow() })).toBe(0);
    expect((await service.list(mgrMedia)).map((d) => d.id)).toEqual([d2.id]);

    // Finalize d2 again on 2026-11-20 -> fresh 15-day timer starts
    await service.update(vol1, d2.id, { status: "COMPLETED" });

    // 14 days after re-finalization: still exists
    setNow("2026-12-04T12:00:00.000Z");
    expect(await purgeExpiredCompletedDemands({ repository, now: getNow() })).toBe(0);

    // 15 days after re-finalization: silently removed on list() lazy cleanup too
    setNow("2026-12-05T12:00:00.000Z");
    expect(await service.list(mgrMedia)).toEqual([]);
  });

  test("enforces self-only rule for ADMIN/GM, forbids DEVELOPER assignment, and strips DEVELOPER creator", async () => {
    const { service, people } = setupDemandsFixture();
    const dev = people.get("dev-1");
    const admin1 = people.get("admin-1");
    const admin2 = people.get("admin-2");
    const gm1 = people.get("gm-1");
    const mgrMedia = people.get("mgr-media");

    await expect(
      service.create(dev, {
        title: "Auto dev",
        departmentId: "dept-media",
        assigneeIds: [dev.id],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const byDev = await service.create(dev, {
      title: "Criada pelo dev",
      departmentId: "dept-media",
    });
    expect(byDev.createdBy).toBeNull();
    expect(byDev.status).toBe("IN_PROGRESS");

    await expect(
      service.create(mgrMedia, {
        title: "Forçar GM",
        departmentId: "dept-media",
        assigneeIds: [gm1.id],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.create(admin1, {
        title: "Forçar outro Admin",
        departmentId: "dept-media",
        assigneeIds: [admin2.id],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const selfGm = await service.create(gm1, {
      title: "GM assume demanda",
      departmentId: "dept-media",
      assigneeIds: [gm1.id],
    });
    expect(selfGm.assignees.map((p) => p.id)).toEqual([gm1.id]);

    const selfAdmin = await service.create(admin1, {
      title: "Admin assume demanda",
      departmentId: "dept-media",
      assigneeIds: [admin1.id],
    });
    expect(selfAdmin.assignees.map((p) => p.id)).toEqual([admin1.id]);
  });
});

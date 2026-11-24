import { z } from "zod";
import { ASSIGNABLE_ROLE_LIST } from "../../shared/auth/roles.js";

const department = z.object({
  id: z.uuid(),
  name: z.string(),
  hasDemands: z.boolean(),
});

const person = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  role: z.enum(ASSIGNABLE_ROLE_LIST).optional(),
});

const status = z.enum(["IN_PROGRESS", "COMPLETED"]);

export const demand = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status,
  dueAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  department,
  assignees: z.array(person),
  createdBy: person.nullable(),
});

export const demandList = z.array(demand);

export const candidateList = z.array(person);

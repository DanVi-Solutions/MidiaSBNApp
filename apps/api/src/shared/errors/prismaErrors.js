import { Prisma } from "@prisma/client";

export function isPrismaError(error, code) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export function isUniqueViolationOn(error, column) {
  return isPrismaError(error, "P2002") && JSON.stringify(error.meta ?? {}).includes(column);
}

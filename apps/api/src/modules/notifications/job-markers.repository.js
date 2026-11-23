import { prisma } from "../../config/database.js";
import { isPrismaError } from "../../shared/errors/prismaErrors.js";

export const jobMarkersRepository = {
  async advance(key, value) {
    const current = await prisma.jobMarker.findUnique({ where: { key } });

    if (!current) {
      try {
        await prisma.jobMarker.create({ data: { key, value } });
      } catch (error) {
        if (!isPrismaError(error, "P2002")) throw error;
      }
      return { advanced: false, firstRun: true };
    }

    if (current.value === value) return { advanced: false, firstRun: false };

    const { count } = await prisma.jobMarker.updateMany({ where: { key, value: current.value }, data: { value } });
    return { advanced: count === 1, firstRun: false };
  },
};

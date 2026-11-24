import { prisma } from "../src/config/database.js";
import { generateCredentialNumber } from "../src/modules/credentials/credential-number.js";

async function ensureDeveloper() {
  const existing = await prisma.credential.findFirst({ where: { role: "DEVELOPER" } });
  if (existing) {
    console.log("Desenvolvedor já existe, nada a fazer.");
    return;
  }

  const developer = await prisma.credential.create({
    data: {
      name: process.env.SEED_DEVELOPER_NAME ?? "Desenvolvedor",
      role: "DEVELOPER",
      status: "PENDING",
      credentialNumber: generateCredentialNumber("DEVELOPER"),
    },
  });

  console.log("Desenvolvedor criado. Guarde o código de credencial:");
  console.log(`  ${developer.credentialNumber}`);
}

async function ensureFirstAdministrator() {
  const existing = await prisma.credential.findFirst({ where: { role: "ADMINISTRATOR" } });
  if (existing) {
    console.log("Administrador já existe, nada a fazer.");
    return;
  }

  const admin = await prisma.credential.create({
    data: {
      name: process.env.SEED_ADMIN_NAME ?? "Administrador",
      role: "ADMINISTRATOR",
      status: "PENDING",
      credentialNumber: generateCredentialNumber(),
    },
  });

  console.log("Administrador criado. Guarde o código de credencial:");
  console.log(`  ${admin.credentialNumber}`);
}

async function seed() {
  await ensureDeveloper();
  await ensureFirstAdministrator();
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

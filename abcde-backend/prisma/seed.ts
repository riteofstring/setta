import { PrismaClient } from '@prisma/client';
import { saveCodeInfo } from '../src/codeInfo/savingFunctions';
import { loadSpecificTestData } from '../test/utils';
const prisma = new PrismaClient();
import _ = require('lodash');

async function main() {
  await seedUsers();
  await seedCodeInfo();
}

async function seedUsers() {
  const data = await loadSpecificTestData({ name: 'Users' });
  await Promise.all(
    _.values(data).map(
      async (v) =>
        await prisma.user.upsert({
          where: { id: v.id },
          create: v,
          update: v,
        }),
    ),
  );
}

async function seedCodeInfo() {
  const data = await loadSpecificTestData({ name: 'AllCodeInfo' });
  await saveCodeInfo(prisma, data);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

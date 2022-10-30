import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveUsers(prisma: PrismaClient, data) {
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

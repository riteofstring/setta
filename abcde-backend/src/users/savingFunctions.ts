import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveUsers(prisma: PrismaClient, data) {
  await prisma.$transaction(
    _.values(data).map((v) =>
      prisma.user.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}

import * as _ from 'lodash';
import { prisma } from 'src/prisma';
import { UserType } from './types';

export async function saveUsers(data: UserType) {
  await prisma.$transaction(
    Object.values(data).map((v) => {
      const curr = _.pick(v, ['id', 'name', 'password']);
      return prisma.user.upsert({
        where: { id: curr.id, name: curr.name },
        create: curr,
        update: curr,
      });
    }),
  );
}

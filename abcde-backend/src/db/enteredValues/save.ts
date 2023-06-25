import { Prisma } from '@prisma/client';
import { ManyEVType } from 'abcde-utils/src/types/ev';
import { ManyEVColType } from 'abcde-utils/src/types/evCol';
import { prisma } from 'src/db/prisma';
import { deleteManyFirst } from 'src/utils/utils';

export async function saveEV(ev: ManyEVType) {
  const upsert = Object.keys(ev).map((id): Prisma.EVUpsertArgs['create'] => {
    const value = ev[id];
    return { id, value: value !== null ? value.toString() : null };
  });

  await prisma.$transaction(
    upsert.map((v) =>
      prisma.eV.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}

export async function saveEVCols(evCols: ManyEVColType) {
  const create = Object.entries(evCols).map(
    ([id, evCol]): Prisma.EVColIdUpsertArgs['create'] => ({
      id,
      children: {
        create: Object.entries(evCol).map(([codeInfoId, evId]) => ({
          codeInfoId,
          evId,
        })),
      },
    }),
  );

  await prisma.$transaction(
    create.map((v) =>
      prisma.eVColId.upsert({
        where: { id: v.id as string },
        create: v,
        update: deleteManyFirst(v, 'children'),
      }),
    ),
  );
}

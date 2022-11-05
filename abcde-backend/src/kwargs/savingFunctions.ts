import { PrismaClient } from '@prisma/client';
import { deleteThenCreateCol } from '../utils/utils';
import _ = require('lodash');

export async function saveKwargCols(prisma: PrismaClient, kwargCols) {
  const ids = _.keys(kwargCols);
  await prisma.kwargColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const idid of Object.keys(kwargCols)) {
    for (const codeInfoId of _.keys(kwargCols[idid])) {
      let order = 0;
      for (const kwargInfoId of kwargCols[idid][codeInfoId]) {
        inDbFormat.push({
          idid,
          codeInfoId,
          kwargInfoId,
          order,
        });
        order += 1;
      }
    }
  }

  deleteThenCreateCol(prisma, prisma.kwargCol, inDbFormat);
}

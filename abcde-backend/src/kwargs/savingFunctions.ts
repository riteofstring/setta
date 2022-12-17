import { PrismaClient } from '@prisma/client';
import { deleteThenCreateCol } from 'src/utils/utils';

export interface KwargColsObj {
  [id: string]: { [codeInfoId: string]: string[] };
}

export async function saveKwargCols(
  prisma: PrismaClient,
  kwargCols: KwargColsObj,
) {
  const ids = Object.keys(kwargCols);
  await prisma.kwargColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = [];
  for (const idid of ids) {
    for (const [codeInfoId, kwargInfoList] of Object.entries(kwargCols[idid])) {
      for (const [order, kwargInfoId] of kwargInfoList.entries()) {
        inDbFormat.push({
          idid,
          codeInfoId,
          kwargInfoId,
          order,
        });
      }
    }
  }

  deleteThenCreateCol(prisma, prisma.kwargCol, ids, inDbFormat);
}

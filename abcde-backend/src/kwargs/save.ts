import { PrismaClient } from '@prisma/client';
import { saveCodeInfo } from 'src/codeInfo/save';
import { deleteThenCreateCol } from 'src/utils/utils';
import { KwargColsType } from './types';

export async function saveKwargCols(
  prisma: PrismaClient,
  kwargCols: KwargColsType,
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

export async function saveKwargInfo(prisma, kwargInfo) {
  await saveCodeInfo(prisma, kwargInfo, true);
}

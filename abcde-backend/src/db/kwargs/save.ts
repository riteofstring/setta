import { saveCodeInfo } from 'src/db/codeInfo/save';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';
import { KwargColsType } from './types';

export async function saveKwargCols(kwargCols: KwargColsType) {
  const ids = Object.keys(kwargCols);
  await prisma.kwargColId.createMany({
    data: ids.map((x) => ({ id: x })),
    skipDuplicates: true,
  });

  const inDbFormat = [] as any;
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

  await deleteThenCreateCol(prisma.kwargCol, ids, inDbFormat);
}

export async function saveKwargInfo(kwargInfo) {
  await saveCodeInfo(kwargInfo, true);
}

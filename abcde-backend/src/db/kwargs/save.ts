import { ManyCodeInfoType } from 'abcde-utils/src/types/codeInfo';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { prisma } from 'src/db/prisma';
import { deleteThenCreateCol } from 'src/utils/utils';

export async function saveKwargCols(kwargCols: ManyKwargColType) {
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

export async function saveKwargInfo(kwargInfo: ManyCodeInfoType) {
  await saveCodeInfo(kwargInfo, true);
}

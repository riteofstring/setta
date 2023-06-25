import { Prisma } from '@prisma/client';
import { ManyCodeInfoType } from 'abcde-utils/src/types/codeInfo';
import { ManyKwargColType } from 'abcde-utils/src/types/kwargCol';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { prisma } from 'src/db/prisma';

export async function saveKwargCols(kwargCols: ManyKwargColType) {
  const ids = Object.keys(kwargCols);
  const inDbFormat: Prisma.KwargColCreateManyInput[] = [];
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

  await prisma.$transaction([
    prisma.kwargColId.createMany({
      data: ids.map((x) => ({ id: x })),
      skipDuplicates: true,
    }),
    prisma.kwargCol.deleteMany({
      where: { idid: { in: ids } },
    }),
    prisma.kwargCol.createMany({ data: inDbFormat }),
  ]);
}

export async function saveKwargInfo(kwargInfo: ManyCodeInfoType) {
  await saveCodeInfo(kwargInfo, true);
}

import { Prisma, PrismaClient } from '@prisma/client';
import _ = require('lodash');

export async function saveEV(prisma: PrismaClient, ev) {
  const inDbFormat = [];
  for (const id of _.keys(ev)) {
    const v = ev[id];
    const curr = { id, value: v.value ? v.value.toString() : null };
    if (v.childId) {
      curr['child'] = {
        connect: { id: v.childId },
      };
    } else {
      curr['child'] = Prisma.DbNull;
    }
    inDbFormat.push(curr);
  }

  await prisma.$transaction(
    inDbFormat.map((v) =>
      prisma.eV.upsert({
        where: { id: v.id },
        create: v,
        update: v,
      }),
    ),
  );
}

// export async function persistEV(em, ev) {
//   for (const evId of _.keys(ev)) {
//     const v = ev[evId];
//     const findBy = { id: evId };
//     const assign = {
//       value: v.value ? v.value.toString() : null,
//       child: returnNullNotUndefined(v.childId),
//     };
//     await createIfNotFound(em, EV, findBy, assign);
//   }
// }

// export async function persistEVCols(em, evCols) {
//   for (const evColId of _.keys(evCols)) {
//     await createIfNotFound(em, EVColsIds, { id: evColId });
//     for (const codeInfoId of _.keys(evCols[evColId])) {
//       const findBy = {
//         id: evColId,
//         codeInfo: codeInfoId,
//       };
//       const assign = {
//         enteredValue: evCols[evColId][codeInfoId],
//       };
//       await createIfNotFound(em, EVCols, findBy, assign);
//     }
//   }
// }

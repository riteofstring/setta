import _ = require('lodash');
import { PrismaClient } from '@prisma/client';

export async function saveCodeInfo(prisma: PrismaClient, codeInfo) {
  const data = Object.values(codeInfo).map((v) =>
    _.pick(v, [
      'id',
      'name',
      'version',
      'type',
      'rcType',
      'defaultVal',
      'description',
      'path',
    ]),
  );
  await prisma.codeInfo.createMany({ data, skipDuplicates: true });

  // for (const v of _.values(codeInfo)) {
  //   const { parent, children, ...assign } = v;
  //   const findBy = { id: v.id };
  //   await createIfNotFound(em, CodeInfo, findBy, assign);
  // }

  // // now add the children
  // for (const v of _.values(codeInfo)) {
  //   const x = await em.findOne(CodeInfo, { id: v.id });
  //   em.assign(x, {
  //     children: v.children ? v.children : [],
  //     parent: v.parentId,
  //   });
  // }
}

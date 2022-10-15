import { CodeInfo } from '../entities/codeInfo.entity';
import _ = require('lodash');
import { createIfNotFound } from '../utils/utils';

// TODO
// Add this to package.json when we switch to a monorepo
// "imports": {
//   "#abcde-data/*": "abcde-frontend/src/__tests__data/*"
// }

export async function persistCodeInfo(em, codeInfo) {
  for (const v of _.values(codeInfo)) {
    const { parent, children, ...assign } = v;
    const findBy = { id: v.id };
    await createIfNotFound(em, CodeInfo, findBy, assign);
  }

  // now add the children
  for (const v of _.values(codeInfo)) {
    const x = await em.findOne(CodeInfo, { id: v.id });
    em.assign(x, {
      children: v.children ? v.children : [],
      parent: v.parentId,
    });
  }
}

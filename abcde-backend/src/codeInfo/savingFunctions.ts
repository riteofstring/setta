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
    const findBy = { id: v.id };
    const assign = {
      name: v.name,
      version: v.version,
      defaultVal: v.defaultVal,
      type: v.type,
      rcType: v.rcType,
      description: v.description,
      path: v.path,
    };
    await createIfNotFound(em, CodeInfo, findBy, assign);
  }

  // now add the children
  for (const v of _.values(codeInfo)) {
    const x = await em.findOne(CodeInfo, { id: v.id });
    em.assign(x, {
      children: v.children,
      parent: v.parentId,
    });
  }
}

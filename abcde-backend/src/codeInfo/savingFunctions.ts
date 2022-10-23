import { CodeInfo } from '../entities/codeInfo.entity';
import _ = require('lodash');

export async function persistCodeInfo(em, codeInfo) {
  for (const v of _.values(codeInfo)) {
    const { parentId, children, ...assign } = v;
    await em.upsert(CodeInfo, assign);
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

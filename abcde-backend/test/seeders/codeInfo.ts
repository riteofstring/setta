import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { CodeInfo } from '../../src/entities/codeInfo.entity';
import data from '../../../abcde-frontend/src/__tests__data/simpleTrainTest/CodeInfo';

// TODO
// Add this to package.json when we switch to a monorepo
// "imports": {
//   "#abcde-data/*": "abcde-frontend/src/__tests__data/*"
// }

export class CodeInfoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of Object.values(data)) {
      let curr = new CodeInfo();
      const { children, ...otherProps } = x;
      curr = Object.assign(curr, otherProps);
      em.persist(curr);
    }
    em.flush();

    // now add the children
    for (const x of Object.values(data)) {
      const children = x.children;
      const childrenObjs = await em.find(CodeInfo, {
        id: { $in: children },
      });
      const parent = await em.findOne(
        CodeInfo,
        { id: x.id },
        { populate: ['children'] },
      );
      parent.children.set(childrenObjs);
    }
  }
}

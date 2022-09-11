import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { CodeInfo } from '../../src/entities/codeInfo.entity';
import data from '../seedData/codeInfo';

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
    }
  }
}

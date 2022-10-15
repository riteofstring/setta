import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import allCodeInfo from '../../../abcde-frontend/src/__tests__data/AllCodeInfo';
import { persistCodeInfo } from '../../src/codeInfo/savingFunctions';

// TODO
// Add this to package.json when we switch to a monorepo
// "imports": {
//   "#abcde-data/*": "abcde-frontend/src/__tests__data/*"
// }

export class CodeInfoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    await persistCodeInfo(em, allCodeInfo);
  }
}

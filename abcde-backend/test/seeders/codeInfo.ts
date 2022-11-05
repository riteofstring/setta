import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { loadSpecificTestData } from '../utils';
import { persistCodeInfo } from '../../src/codeInfo/savingFunctions';

export class CodeInfoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const data = await loadSpecificTestData({ name: 'AllCodeInfo' });
    await persistCodeInfo(em, data);
  }
}

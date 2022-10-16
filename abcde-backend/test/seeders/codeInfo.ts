import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { loadTestData } from '../utils';
import { persistCodeInfo } from '../../src/codeInfo/savingFunctions';

export class CodeInfoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // console.log(BaseUITypes);
    const data = await loadTestData();
    console.log(data);
    // await persistCodeInfo(em, allCodeInfo);
  }
}

import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Packages } from '../../src/entities/packages.entity';
import data from '../seedData/packages';

export class PackagesSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const x of Object.values(data.children)) {
      const { children, ...packageData } = x;
      em.create(Packages, packageData);
    }
  }
}

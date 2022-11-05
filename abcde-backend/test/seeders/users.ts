import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { loadSpecificTestData } from '../utils';
import { Users } from '../../src/entities/users.entity';

export class UsersSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const data = await loadSpecificTestData({ name: 'Users' });
    Object.values(data).forEach((x) => em.create(Users, x));
  }
}

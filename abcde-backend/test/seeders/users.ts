import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Users } from '../../src/entities/users.entity';
import data from '../../../abcde-frontend/src/__tests__data/Users';

export class UsersSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    Object.values(data).forEach((x) => em.create(Users, x));
  }
}

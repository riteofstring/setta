import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Users } from '../../src/entities/users.entity';
import data from '../seedData/users';

export class UsersSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    data.forEach((x) => em.create(Users, x));
  }
}

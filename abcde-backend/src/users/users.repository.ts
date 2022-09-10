import { EntityRepository } from '@mikro-orm/postgresql';
import { Users } from '../entities/users.entity';

export class UsersRepository extends EntityRepository<Users> {}

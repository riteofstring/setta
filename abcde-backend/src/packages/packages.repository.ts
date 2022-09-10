import { EntityRepository } from '@mikro-orm/postgresql';
import { Packages } from '../entities/packages.entity';

export class PackagesRepository extends EntityRepository<Packages> {}

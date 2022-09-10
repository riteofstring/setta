import { EntityRepository } from '@mikro-orm/postgresql';
import { UIs } from '../entities/uis.entity';

export class UIsRepository extends EntityRepository<UIs> {}

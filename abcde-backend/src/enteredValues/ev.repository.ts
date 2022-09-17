import { EntityRepository } from '@mikro-orm/postgresql';
import { EV } from '../entities/enteredValues/ev.entity';

export class EVRepository extends EntityRepository<EV> {}

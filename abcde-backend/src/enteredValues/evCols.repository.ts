import { EntityRepository } from '@mikro-orm/postgresql';
import { EVCols } from '../entities/enteredValues/evCols.entity';

export class EVColsRepository extends EntityRepository<EVCols> {}

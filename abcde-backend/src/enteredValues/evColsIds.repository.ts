import { EntityRepository } from '@mikro-orm/postgresql';
import { EVColsIds } from '../entities/enteredValues/evColsIds.entity';

export class EVColsIdsRepository extends EntityRepository<EVColsIds> {}

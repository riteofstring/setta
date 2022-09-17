import { EntityRepository } from '@mikro-orm/postgresql';
import { EnteredValues } from '../entities/enteredValues/enteredValues.entity';

export class EnteredValuesRepository extends EntityRepository<EnteredValues> {}

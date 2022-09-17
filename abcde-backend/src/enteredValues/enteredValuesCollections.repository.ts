import { EntityRepository } from '@mikro-orm/postgresql';
import { EnteredValuesCollections } from '../entities/enteredValues/enteredValuesCollections.entity';

export class EnteredValuesCollectionsRepository extends EntityRepository<EnteredValuesCollections> {}

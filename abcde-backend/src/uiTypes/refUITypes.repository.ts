import { EntityRepository } from '@mikro-orm/postgresql';
import { RefUITypes } from '../entities/uiTypes/refUITypes.entity';

export class RefUITypesRepository extends EntityRepository<RefUITypes> {}

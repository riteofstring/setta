import { EntityRepository } from '@mikro-orm/postgresql';
import { UITypes } from '../entities/uiTypes/uiTypes.entity';

export class UITypesRepository extends EntityRepository<UITypes> {}

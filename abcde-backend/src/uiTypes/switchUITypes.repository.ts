import { EntityRepository } from '@mikro-orm/postgresql';
import { SwitchUITypes } from '../entities/uiTypes/switchUITypes.entity';

export class SwitchUITypesRepository extends EntityRepository<SwitchUITypes> {}

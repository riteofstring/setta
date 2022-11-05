import { EntityRepository } from '@mikro-orm/postgresql';
import { TextUITypes } from '../entities/uiTypes/textUITypes.entity';

export class TextUITypesRepository extends EntityRepository<TextUITypes> {}

import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionUITypes } from '../entities/uiTypes/sectionUITypes.entity';

export class SectionUITypesRepository extends EntityRepository<SectionUITypes> {}

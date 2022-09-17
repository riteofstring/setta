import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionEVCols } from '../entities/enteredValues/sectionEvCols.entity';

export class SectionEVColsRepository extends EntityRepository<SectionEVCols> {}

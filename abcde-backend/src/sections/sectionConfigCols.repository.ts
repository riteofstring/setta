import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionConfigCols } from '../entities/sectionConfigCols.entity';

export class SectionConfigColsRepository extends EntityRepository<SectionConfigCols> {}

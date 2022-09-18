import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionConfigCols } from '../entities/sections/sectionConfigCols.entity';

export class SectionConfigColsRepository extends EntityRepository<SectionConfigCols> {}

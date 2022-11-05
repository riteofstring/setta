import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionChildrenIds } from '../entities/sections/sectionChildrenIds.entity';

export class SectionChildrenIdsRepository extends EntityRepository<SectionChildrenIds> {}

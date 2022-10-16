import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionChildren } from '../entities/sections/sectionChildren.entity';

export class SectionChildrenRepository extends EntityRepository<SectionChildren> {}

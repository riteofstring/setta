import { EntityRepository } from '@mikro-orm/postgresql';
import { SectionConfig } from '../entities/sections/sectionConfig.entity';

export class SectionConfigRepository extends EntityRepository<SectionConfig> {}

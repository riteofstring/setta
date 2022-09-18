import { EntityRepository } from '@mikro-orm/postgresql';
import { Sections } from '../entities/sections/sections.entity';

export class SectionsRepository extends EntityRepository<Sections> {}

import { EntityRepository } from '@mikro-orm/postgresql';
import { ProjectConfigs } from '../entities/projects/projectConfigs.entity';

export class ProjectConfigsRepository extends EntityRepository<ProjectConfigs> {}

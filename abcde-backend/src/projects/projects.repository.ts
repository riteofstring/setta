import { EntityRepository } from '@mikro-orm/postgresql';
import { Projects } from '../entities/projects/projects.entity';

export class ProjectsRepository extends EntityRepository<Projects> {}

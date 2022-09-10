import { EntityRepository } from '@mikro-orm/postgresql';
import { Projects } from '../entities/projects.entity';

export class ProjectsRepository extends EntityRepository<Projects> {}

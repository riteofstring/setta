import {
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { ProjectsRepository } from '../../projects/projects.repository';
import { Users } from '../users.entity';
import { ProjectConfigs } from './projectConfigs.entity';

// A project is a collection of sections, settings, module collections etc.
@Entity({ customRepository: () => ProjectsRepository })
export class Projects {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @ManyToOne()
  owner: Users;

  @OneToMany(() => ProjectConfigs, (e) => e.project)
  projectConfigs: ProjectConfigs;

  @OneToOne({ entity: () => ProjectConfigs, nullable: true })
  defaultProjectConfig: ProjectConfigs;
}

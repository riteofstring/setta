import {
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { ProjectsRepository } from '../projects/projects.repository';
import { SectionConfigColsIds } from './sections/sectionConfigColsIds.entity';
import { Sections } from './sections/sections.entity';
import { Users } from './users.entity';

// A project is a collection of sections, settings, module collections etc.
@Entity({ customRepository: () => ProjectsRepository })
export class Projects {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @ManyToOne()
  owner: Users;

  @OneToOne()
  sectionGroup: Sections;

  @ManyToOne()
  sectionConfigCol: SectionConfigColsIds;
}

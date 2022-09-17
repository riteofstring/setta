import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { ProjectsRepository } from '../projects/projects.repository';
import { Sections } from './sections.entity';
import { Users } from './users.entity';

// A project is a collection of sections, settings, module collections etc.
@Entity({ customRepository: () => ProjectsRepository })
export class Projects {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @ManyToOne({ primary: false, hidden: true })
  owner: Users;

  @ManyToMany(() => Sections)
  sections = new Collection<Sections>(this);
}

import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { ProjectsRepository } from '../projects/projects.repository';
import { UIs } from './uis.entity';
import { Users } from './users.entity';

// A project is a collection of UIs, settings, module collections etc.
@Entity({ customRepository: () => ProjectsRepository })
export class Projects {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;

  @ManyToOne({ primary: false, hidden: true })
  owner: Users;

  @ManyToMany(() => UIs)
  uis = new Collection<UIs>(this);
}

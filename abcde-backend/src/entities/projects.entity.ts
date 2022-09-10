import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { ProjectsRepository } from '../projects/projects.repository';
import { Users } from './users.entity';

@Entity({ customRepository: () => ProjectsRepository })
export class Projects {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;

  @ManyToOne({ primary: false, hidden: true })
  owner: Users;

  constructor({ name, owner }: { name: string; owner: Users }) {
    this.name = name;
    this.owner = owner;
  }
}

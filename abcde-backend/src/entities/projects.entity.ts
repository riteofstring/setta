import { Entity, OneToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { ProjectsRepository } from '../projects/projects.repository';
import { Users } from './users.entity';

@Entity({ customRepository: () => ProjectsRepository })
export class Projects {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;

  @OneToOne({ primary: false })
  owner: Users;

  constructor({ name, owner }: { name: string; owner: Users }) {
    this.name = name;
    this.owner = owner;
  }
}

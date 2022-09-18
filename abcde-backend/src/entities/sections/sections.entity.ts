import {
  Collection,
  Entity,
  ManyToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { SectionsRepository } from '../../sections/sections.repository';

@Entity({ customRepository: () => SectionsRepository })
export class Sections {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string = '';

  @ManyToMany(() => Sections)
  children = new Collection<Sections>(this);
}

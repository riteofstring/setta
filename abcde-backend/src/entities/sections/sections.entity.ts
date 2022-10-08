import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { SectionsRepository } from '../../sections/sections.repository';
import { CodeInfo } from '../codeInfo.entity';

@Entity({ customRepository: () => SectionsRepository })
export class Sections {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string = '';

  // what parameter is this section associated with, if any?
  @ManyToOne({ nullable: true })
  paramInfo: CodeInfo;

  @ManyToMany(() => Sections)
  children = new Collection<Sections>(this);
}

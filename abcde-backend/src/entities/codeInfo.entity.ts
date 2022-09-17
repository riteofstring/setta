import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { CodeInfoRepository } from '../codeInfo/codeInfo.repository';

// A project is a collection of UIs, settings, module collections etc.
@Entity({ customRepository: () => CodeInfoRepository })
export class CodeInfo {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @Property({ nullable: true })
  version?: string;

  @Property({ nullable: true })
  defaultVal?: string;

  @Property()
  type: string;

  @Property({ nullable: true })
  rel?: string;

  @Property({ nullable: true })
  description?: string;

  @ManyToOne({ nullable: true })
  parent?: CodeInfo;

  @ManyToMany(() => CodeInfo)
  children = new Collection<CodeInfo>(this);
}

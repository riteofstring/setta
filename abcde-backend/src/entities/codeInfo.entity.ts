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

  // the type in the code, e.g. bool, int, float, class etc.
  @Property()
  type: string = '';

  // "runcoder" type, i.e. a label we assign to determine
  // whether it requires a search box, whether it's a collection etc.
  @Property()
  rcType: string;

  @Property({ nullable: true })
  description?: string;

  @ManyToOne({ nullable: true })
  parent?: CodeInfo;

  // It can have children without being their parent
  @ManyToMany(() => CodeInfo)
  children = new Collection<CodeInfo>(this);

  // path for using in code
  // e.g. numpy.random.rand is the path for the 'rand' function
  @Property({ nullable: true })
  path: string;
}

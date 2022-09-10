import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { PackagesRepository } from '../packages/packages.repository';

// A project is a collection of UIs, settings, module collections etc.
@Entity({ customRepository: () => PackagesRepository })
export class Packages {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @Property()
  version: string;
}

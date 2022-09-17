import { Collection, Entity, ManyToMany, PrimaryKey } from '@mikro-orm/core';
import { UIsRepository } from '../uis/uis.repository';
import { Sections } from './sections.entity';

// A UI is a collection of sections
@Entity({ customRepository: () => UIsRepository })
export class UIs {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToMany(() => Sections)
  sections = new Collection<Sections>(this);
}

import { Collection, Entity, OneToMany, PrimaryKey } from '@mikro-orm/core';
import { SectionChildrenIdsRepository } from '../../sections/sectionChildrenIds.repository';
import { SectionChildren } from './sectionChildren.entity';

@Entity({ customRepository: () => SectionChildrenIdsRepository })
export class SectionChildrenIds {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @OneToMany(() => SectionChildren, (e) => e.id)
  sectionChildren = new Collection<SectionChildren>(this);
}

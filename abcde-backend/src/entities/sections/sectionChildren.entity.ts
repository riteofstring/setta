import { Entity, ManyToOne, PrimaryKeyType, Property } from '@mikro-orm/core';
import { SectionChildrenRepository } from '../../sections/sectionChildren.repository';
import { SectionChildrenIds } from './sectionChildrenIds.entity';
import { Sections } from './sections.entity';

@Entity({ customRepository: () => SectionChildrenRepository })
export class SectionChildren {
  @ManyToOne({ entity: 'SectionChildrenIds', primary: true })
  id: SectionChildrenIds;

  @ManyToOne({ primary: true, entity: 'Sections' })
  section: Sections;

  // integer representing position among siblings in a list
  @Property()
  order: number;

  [PrimaryKeyType]?: [string, string];
}

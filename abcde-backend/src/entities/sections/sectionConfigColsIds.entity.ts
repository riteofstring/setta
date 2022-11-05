import { Collection, Entity, OneToMany, PrimaryKey } from '@mikro-orm/core';
import { SectionConfigColsIdsRepository } from '../../sections/sectionConfigColsIds.repository';
import { SectionConfigCols } from './sectionConfigCols.entity';

// Allows referencing a single primary key to get a group of rows from EVCols
@Entity({ customRepository: () => SectionConfigColsIdsRepository })
export class SectionConfigColsIds {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @OneToMany(() => SectionConfigCols, (e) => e.id)
  sectionConfigCols = new Collection<SectionConfigCols>(this);
}

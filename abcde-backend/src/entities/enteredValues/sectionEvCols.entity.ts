import { Entity, ManyToOne, PrimaryKey, PrimaryKeyType } from '@mikro-orm/core';
import { SectionEVColsRepository } from '../../enteredValues/sectionEvCols.repository';
import { Sections } from '../sections.entity';
import { EVCols } from './evCols.entity';

// groups of section -> evCol mappings
@Entity({ customRepository: () => SectionEVColsRepository })
export class SectionEVCols {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToOne({ primary: true })
  section: Sections;

  @ManyToOne()
  evCol: EVCols;

  [PrimaryKeyType]?: [string, number];
}

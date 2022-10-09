import { Entity, ManyToOne, PrimaryKeyType } from '@mikro-orm/core';
import { SectionConfigColsRepository } from '../../sections/sectionConfigCols.repository';
import { Sections } from './sections.entity';
import { SectionConfigColsIds } from './sectionConfigColsIds.entity';
import { SectionConfig } from './sectionConfig.entity';

// groups of section -> evCol mappings
@Entity({ customRepository: () => SectionConfigColsRepository })
export class SectionConfigCols {
  @ManyToOne(() => SectionConfigColsIds, { primary: true })
  id: SectionConfigColsIds;

  @ManyToOne({ primary: true })
  section: Sections;

  @ManyToOne({ nullable: true })
  config: SectionConfig;

  [PrimaryKeyType]?: [string, string];
}

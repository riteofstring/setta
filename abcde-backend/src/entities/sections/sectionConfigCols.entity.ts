import { Entity, ManyToOne, PrimaryKeyType } from '@mikro-orm/core';
import { SectionConfigColsRepository } from '../../sections/sectionConfigCols.repository';
import { CodeInfo } from '../codeInfo.entity';
import { Sections } from './sections.entity';
import { UITypes } from '../uitypes/uiTypes.entity';
import { EVColsIds } from '../enteredValues/evColsIds.entity';
import { SectionConfigColsIds } from './sectionConfigColsIds.entity';

// groups of section -> evCol mappings
@Entity({ customRepository: () => SectionConfigColsRepository })
export class SectionConfigCols {
  @ManyToOne(() => SectionConfigColsIds, { primary: true })
  id: SectionConfigColsIds;

  @ManyToOne({ primary: true })
  section: Sections;

  @ManyToOne({ nullable: true })
  evCol: EVColsIds;

  @ManyToOne({ nullable: true })
  selectedItem: CodeInfo;

  @ManyToOne({ nullable: true })
  sectionType: UITypes;

  [PrimaryKeyType]?: [string, number];
}

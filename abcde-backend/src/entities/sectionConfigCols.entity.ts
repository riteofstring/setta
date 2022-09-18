import { Entity, ManyToOne, PrimaryKey, PrimaryKeyType } from '@mikro-orm/core';
import { SectionConfigColsRepository } from '../sections/sectionConfigCols.repository';
import { CodeInfo } from './codeInfo.entity';
import { Sections } from './sections.entity';
import { EVCols } from './enteredValues/evCols.entity';
import { UITypesCols } from './uiTypes/uiTypesCols.entity';
import { UITypes } from './uitypes/uiTypes.entity';

// groups of section -> evCol mappings
@Entity({ customRepository: () => SectionConfigColsRepository })
export class SectionConfigCols {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToOne({ primary: true })
  section: Sections;

  @ManyToOne()
  evCol: EVCols;

  @ManyToOne()
  selectedItem: CodeInfo;

  @ManyToOne()
  uiTypeCol: UITypesCols;

  @ManyToOne()
  sectionType: UITypes;

  [PrimaryKeyType]?: [string, number];
}

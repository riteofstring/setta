import { Entity, ManyToOne, PrimaryKey } from '@mikro-orm/core';
import { SectionConfigRepository } from '../../sections/sectionConfig.repository';
import { CodeInfo } from '../codeInfo.entity';
import { UITypes } from '../uitypes/uiTypes.entity';
import { EVColsIds } from '../enteredValues/evColsIds.entity';

// groups of section -> evCol mappings
@Entity({ customRepository: () => SectionConfigRepository })
export class SectionConfig {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToOne({ nullable: true })
  evCol: EVColsIds;

  @ManyToOne({ nullable: true })
  selectedItem: CodeInfo;

  @ManyToOne()
  sectionType: UITypes;
}

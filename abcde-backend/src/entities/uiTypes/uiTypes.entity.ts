import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { UITypesRepository } from '../../uiTypes/uiTypes.repository';
import { CodeInfo } from '../codeInfo.entity';
import { Sections } from '../sections/sections.entity';
import { UITypesColsIds } from './uiTypesColsIds.entity';

@Entity({ customRepository: () => UITypesRepository })
export class UITypes {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @Property()
  type: string;

  // null means its not a preset
  // "user" means its a user-defined preset
  // "base" means its one of the base presets
  @Property({ nullable: true })
  presetType: string;

  @ManyToOne({ nullable: true })
  originSection: Sections;

  @ManyToOne({ nullable: true })
  originUITypeCol: UITypesColsIds;

  @ManyToOne({ nullable: true })
  originCodeInfo: CodeInfo;

  @Property()
  isForChildOfOriginInfoId: boolean;
}

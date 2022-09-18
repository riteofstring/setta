import { Entity, ManyToOne, OneToOne, Property } from '@mikro-orm/core';
import { SectionUITypesRepository } from '../../uiTypes/sectionUITypes.repository';
import { CodeInfo } from '../codeInfo.entity';
import { UITypes } from './uiTypes.entity';
import { UITypesColsIds } from './uiTypesColsIds.entity';

@Entity({ customRepository: () => SectionUITypesRepository })
export class SectionUITypes {
  @OneToOne({ primary: true })
  id: UITypes;

  @OneToOne({ nullable: true })
  collections: CodeInfo;

  @ManyToOne({ nullable: true })
  uiTypeCol: UITypesColsIds;

  @Property({ nullable: true })
  subType: string;

  @ManyToOne({ nullable: true })
  childUIType: UITypes;
}

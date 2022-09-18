import { Entity, ManyToOne, OneToOne } from '@mikro-orm/core';
import { SectionUITypesRepository } from '../../uiTypes/sectionUITypes.repository';
import { CodeInfo } from '../codeInfo.entity';
import { UITypes } from './uiTypes.entity';
import { UITypesColsIds } from './uiTypesColsIds.entity';

@Entity({ customRepository: () => SectionUITypesRepository })
export class SectionUITypes {
  @OneToOne({ primary: true })
  id: UITypes;

  @OneToOne()
  collections: CodeInfo;

  @ManyToOne()
  uiTypeCol: UITypesColsIds;
}

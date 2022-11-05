import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToOne,
  Property,
} from '@mikro-orm/core';
import { SectionUITypesRepository } from '../../uiTypes/sectionUITypes.repository';
import { CodeInfo } from '../codeInfo.entity';
import { UITypes } from './uiTypes.entity';
import { UITypesColsIds } from './uiTypesColsIds.entity';

@Entity({ customRepository: () => SectionUITypesRepository })
export class SectionUITypes {
  @OneToOne({ primary: true })
  id: UITypes;

  @ManyToMany(() => CodeInfo)
  collections = new Collection<CodeInfo>(this);

  @ManyToOne({ nullable: true })
  uiTypeCol: UITypesColsIds;

  @Property({ nullable: true })
  subType: string;

  @ManyToOne({ nullable: true })
  childUIType: UITypes;
}

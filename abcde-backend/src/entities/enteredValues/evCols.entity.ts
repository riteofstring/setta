import { Entity, ManyToOne, PrimaryKeyType } from '@mikro-orm/core';
import { EVColsRepository } from '../../enteredValues/evCols.repository';
import { CodeInfo } from '../codeInfo.entity';
import { Sections } from '../sections/sections.entity';
import { EV } from './ev.entity';
import { EVColsIds } from './evColsIds.entity';

// groups of parameter -> enteredvalue mappings
@Entity({ customRepository: () => EVColsRepository })
export class EVCols {
  @ManyToOne(() => EVColsIds, { primary: true })
  id: EVColsIds;

  @ManyToOne({ primary: true })
  codeInfo: CodeInfo;

  @ManyToOne()
  enteredValue: EV;

  @ManyToOne({ nullable: true })
  child: Sections;

  [PrimaryKeyType]?: [string, number];
}

import { Entity, ManyToOne, PrimaryKeyType } from '@mikro-orm/core';
import { EVColsRepository } from '../../enteredValues/evCols.repository';
import { CodeInfo } from '../codeInfo.entity';
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

  [PrimaryKeyType]?: [string, number];
}

import { Entity, ManyToOne, PrimaryKey, PrimaryKeyType } from '@mikro-orm/core';
import { EVColsRepository } from '../../enteredValues/evCols.repository';
import { CodeInfo } from '../codeInfo.entity';
import { EV } from './ev.entity';

@Entity({ customRepository: () => EVColsRepository })
export class EVCols {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToOne({ primary: true })
  codeInfo: CodeInfo;

  @ManyToOne()
  enteredValue: EV;

  [PrimaryKeyType]?: [string, number];
}

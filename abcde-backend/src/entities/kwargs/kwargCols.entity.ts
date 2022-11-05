import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKeyType,
} from '@mikro-orm/core';
import { KwargColsRepository } from '../../kwargs/kwargCols.repository';
import { CodeInfo } from '../codeInfo.entity';
import { KwargColsIds } from './kwargColsIds.entity';

@Entity({ customRepository: () => KwargColsRepository })
export class KwargCols {
  @ManyToOne(() => KwargColsIds, { primary: true })
  id: KwargColsIds;

  @ManyToOne({ primary: true })
  codeInfo: CodeInfo;

  @ManyToMany(() => CodeInfo)
  kwargInfos = new Collection<CodeInfo>(this);

  [PrimaryKeyType]?: [string, string];
}

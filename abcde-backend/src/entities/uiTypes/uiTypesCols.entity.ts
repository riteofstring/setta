import { Entity, ManyToOne, PrimaryKey, PrimaryKeyType } from '@mikro-orm/core';
import { UITypesColsRepository } from '../../uiTypes/uiTypesCols.repository';
import { CodeInfo } from '../codeInfo.entity';
import { UITypes } from './uiTypes.entity';

// groups of parameter -> uiType mappings
@Entity({ customRepository: () => UITypesColsRepository })
export class UITypesCols {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToOne({ primary: true })
  codeInfo: CodeInfo;

  @ManyToOne()
  uiType: UITypes;

  [PrimaryKeyType]?: [string, number];
}

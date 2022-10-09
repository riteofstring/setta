import { Entity, ManyToOne, PrimaryKey, PrimaryKeyType } from '@mikro-orm/core';
import { UITypesColsRepository } from '../../uiTypes/uiTypesCols.repository';
import { CodeInfo } from '../codeInfo.entity';
import { UITypes } from './uiTypes.entity';
import { UITypesColsIds } from './uiTypesColsIds.entity';

// groups of parameter -> uiType mappings
@Entity({ customRepository: () => UITypesColsRepository })
export class UITypesCols {
  @ManyToOne(() => UITypesColsIds, { primary: true })
  id: UITypesColsIds;

  @ManyToOne({ primary: true })
  codeInfo: CodeInfo;

  @ManyToOne(() => UITypes)
  uiType: UITypes;

  [PrimaryKeyType]?: [string, string];
}

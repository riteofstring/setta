import { Entity, ManyToOne, PrimaryKey, PrimaryKeyType } from '@mikro-orm/core';
import { EnteredValuesCollectionsRepository } from '../../enteredValues/enteredValuesCollections.repository';
import { CodeInfo } from '../codeInfo.entity';
import { EnteredValues } from './enteredValues.entity';

@Entity({ customRepository: () => EnteredValuesCollectionsRepository })
export class EnteredValuesCollections {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @ManyToOne({ primary: true })
  codeInfo: CodeInfo;

  @ManyToOne()
  enteredValue: EnteredValues;

  [PrimaryKeyType]?: [string, number];
}

import { Collection, Entity, OneToMany, PrimaryKey } from '@mikro-orm/core';
import { UITypesColsIdsRepository } from '../../uiTypes/uiTypesColsIds.repository';
import { UITypesCols } from './uiTypesCols.entity';

// Allows referencing a single primary key to get a group of rows from EVCols
@Entity({ customRepository: () => UITypesColsIdsRepository })
export class UITypesColsIds {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @OneToMany(() => UITypesCols, (e) => e.id)
  uiTypesCols = new Collection<UITypesCols>(this);
}

import { Collection, Entity, OneToMany, PrimaryKey } from '@mikro-orm/core';
import { EVColsIdsRepository } from '../../enteredValues/evColsIds.repository';
import { EVCols } from './evCols.entity';

// Allows referencing a single primary key to get a group of rows from EVCols
@Entity({ customRepository: () => EVColsIdsRepository })
export class EVColsIds {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @OneToMany(() => EVCols, (e) => e.id)
  evCols = new Collection<EVCols>(this);
}

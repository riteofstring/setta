import { Collection, Entity, OneToMany, PrimaryKey } from '@mikro-orm/core';
import { KwargColsIdsRepository } from '../..//kwargs/kwargColsIds.repository';
import { KwargCols } from './kwargCols.entity';

// Allows referencing a single primary key to get a group of rows from EVCols
@Entity({ customRepository: () => KwargColsIdsRepository })
export class KwargColsIds {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @OneToMany(() => KwargCols, (e) => e.id)
  kwargCols = new Collection<KwargCols>(this);
}

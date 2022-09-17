import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { EVRepository } from '../../enteredValues/ev.repository';

@Entity({ customRepository: () => EVRepository })
export class EV {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  value: string;
}

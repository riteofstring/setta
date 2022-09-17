import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { EnteredValuesRepository } from '../../enteredValues/enteredValues.repository';

@Entity({ customRepository: () => EnteredValuesRepository })
export class EnteredValues {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  value: string;
}

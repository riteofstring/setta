import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { EVRepository } from '../../enteredValues/ev.repository';
import { Sections } from '../sections/sections.entity';

@Entity({ customRepository: () => EVRepository })
export class EV {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property({ nullable: true })
  value: string;

  @ManyToOne({ nullable: true })
  child: Sections;
}

import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { UIsRepository } from '../uis/uis.repository';

// A UI is a collection of sections
@Entity({ customRepository: () => UIsRepository })
export class UIs {
  @PrimaryKey()
  id: number;

  @Property()
  uuid: string;
}

import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class Users {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;

  @Property({ hidden: true })
  password: string;
}

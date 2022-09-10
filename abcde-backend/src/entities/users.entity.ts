import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { UsersRepository } from '../users/users.repository';

@Entity({ customRepository: () => UsersRepository })
export class Users {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;

  @Property({ hidden: true })
  password: string;
}

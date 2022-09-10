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

  constructor({ username, password }: { username: string; password: string }) {
    this.name = username;
    this.password = password;
  }
}

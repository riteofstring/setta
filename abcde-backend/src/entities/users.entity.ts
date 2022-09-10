import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { UsersRepository } from '../users/users.repository';

@Entity({ customRepository: () => UsersRepository })
export class Users {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @Property({ hidden: true })
  password: string;
}

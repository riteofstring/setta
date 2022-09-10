import { Entity, PrimaryKey } from '@mikro-orm/core';
import { UIsRepository } from '../uis/uis.repository';

// A UI is a collection of sections
@Entity({ customRepository: () => UIsRepository })
export class UIs {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;
}

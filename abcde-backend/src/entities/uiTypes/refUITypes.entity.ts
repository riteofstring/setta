import { Entity, OneToOne } from '@mikro-orm/core';
import { RefUITypesRepository } from '../../uiTypes/refUITypes.repository';
import { UITypes } from './uiTypes.entity';

@Entity({ customRepository: () => RefUITypesRepository })
export class RefUITypes {
  @OneToOne({ primary: true })
  id: UITypes;
}

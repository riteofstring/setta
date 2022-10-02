import { Entity, OneToOne } from '@mikro-orm/core';
import { SwitchUITypesRepository } from '../../uiTypes/switchUITypes.repository';
import { UITypes } from './uiTypes.entity';

@Entity({ customRepository: () => SwitchUITypesRepository })
export class SwitchUITypes {
  @OneToOne({ primary: true })
  id: UITypes;
}

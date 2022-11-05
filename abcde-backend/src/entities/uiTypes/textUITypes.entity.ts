import { Entity, OneToOne } from '@mikro-orm/core';
import { TextUITypesRepository } from '../../uiTypes/textUITypes.repository';
import { UITypes } from './uiTypes.entity';

@Entity({ customRepository: () => TextUITypesRepository })
export class TextUITypes {
  @OneToOne({ primary: true })
  id: UITypes;
}

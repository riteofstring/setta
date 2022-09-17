import { Entity, OneToOne, Property } from '@mikro-orm/core';
import { SliderUITypesRepository } from '../../uiTypes/sliderUITypes.repository';
import { UITypes } from './uiTypes.entity';

@Entity({ customRepository: () => SliderUITypesRepository })
export class SliderUITypes {
  @OneToOne({ primary: true })
  id: UITypes;

  @Property()
  min: number;

  @Property()
  max: number;

  @Property()
  step: number;
}

import { EntityRepository } from '@mikro-orm/postgresql';
import { SliderUITypes } from '../entities/uiTypes/sliderUITypes.entity';

export class SliderUITypesRepository extends EntityRepository<SliderUITypes> {}

import { EntityRepository } from '@mikro-orm/postgresql';
import { KwargCols } from '../entities/kwargs/kwargCols.entity';

export class KwargColsRepository extends EntityRepository<KwargCols> {}

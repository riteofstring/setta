import { EntityRepository } from '@mikro-orm/postgresql';
import { KwargColsIds } from '../entities/kwargs/kwargColsIds.entity';

export class KwargColsIdsRepository extends EntityRepository<KwargColsIds> {}

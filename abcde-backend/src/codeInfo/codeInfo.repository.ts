import { EntityRepository } from '@mikro-orm/postgresql';
import { CodeInfo } from '../entities/codeInfo.entity';

export class CodeInfoRepository extends EntityRepository<CodeInfo> {}

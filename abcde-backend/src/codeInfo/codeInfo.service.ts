import { Injectable } from '@nestjs/common';
import * as _ from 'lodash';
import { PrismaService } from 'src/prisma.service';
import { createAllInfo } from './infoFactory';
import { getCodeInfo } from './loadingFunctions';

@Injectable()
export class CodeInfoService {
  constructor(private prisma: PrismaService) {}

  async getCollectionsAndModules(searchTerm: string) {
    const results = await this.prisma.codeInfo.findMany({
      where: { name: { contains: searchTerm }, rcType: 'collection' },
    });
    return _.keyBy(results, 'id');
  }

  async getCollectionDetails(id: string) {
    return createAllInfo(await getCodeInfo(this.prisma, [id]));
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { createAllInfo } from './infoFactory';
import { getCodeInfo } from './loadingFunctions';
import _ = require('lodash');

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

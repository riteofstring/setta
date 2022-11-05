import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import _ = require('lodash');
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
    return await getCodeInfo(this.prisma, [id]);
  }
}

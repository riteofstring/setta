import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { createAllInfo } from './infoFactory';
import { getCodeInfo, getCollectionsAndModules } from './load';

@Injectable()
export class CodeInfoService {
  constructor(private prisma: PrismaService) {}

  async getCollectionsAndModules(searchTerm: string) {
    return await getCollectionsAndModules(this.prisma, searchTerm);
  }

  async getCollectionDetails(id: string) {
    return createAllInfo(await getCodeInfo(this.prisma, [id]));
  }
}

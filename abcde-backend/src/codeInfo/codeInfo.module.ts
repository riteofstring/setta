import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CodeInfoService } from './codeInfo.service';

@Module({
  providers: [CodeInfoService, PrismaService],
  exports: [CodeInfoService],
})
export class CodeInfoModule {}

import { PrismaService } from '#src/prisma.service';
import { Module } from '@nestjs/common';
import { CodeInfoService } from './codeInfo.service';

@Module({
  providers: [CodeInfoService, PrismaService],
  exports: [CodeInfoService],
})
export class CodeInfoModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CodeGeneratorService } from './codeGenerator.service';

@Module({
  providers: [CodeGeneratorService, PrismaService],
  exports: [CodeGeneratorService],
})
export class CodeGeneratorModule {}

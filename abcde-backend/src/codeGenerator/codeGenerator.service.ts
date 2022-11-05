import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCode as fnGenerateCode } from './codeGenerator';
import _ = require('lodash');

@Injectable()
export class CodeGeneratorService {
  constructor(private prisma: PrismaService) {}

  async generateCode(user, codeJson) {
    const code = fnGenerateCode(codeJson);
    return await this.prisma.generatedCode.create({
      data: { ownerId: user.id, code },
      select: { id: true },
    });
  }

  async getCode(user, codeId) {
    return await this.prisma.generatedCode.findFirst({
      where: { id: codeId, ownerId: user.id },
      select: { code: true },
    });
  }
}

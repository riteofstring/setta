import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCode as fnGenerateCode } from './codeGenerator';
import { exportSelected } from './exportSelected';

@Injectable()
export class CodeGeneratorService {
  constructor(private prisma: PrismaService) {}

  async generateCode(user, codeId, project) {
    const codeJson = exportSelected(project);
    const code = fnGenerateCode(codeJson);
    return await this.prisma.generatedCode.create({
      data: { id: codeId, ownerId: user.id, code },
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

import { PrismaService } from '#src/prisma.service';
import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Module({
  providers: [ProjectsService, PrismaService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

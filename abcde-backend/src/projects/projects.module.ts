import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { Sections } from '../entities/sections/sections.entity';
import { Projects } from '../entities/projects.entity';
import { ProjectsService } from './projects.service';

@Module({
  providers: [ProjectsService],
  imports: [MikroOrmModule.forFeature({ entities: [Projects, Sections] })],
  exports: [ProjectsService],
})
export class ProjectsModule {}

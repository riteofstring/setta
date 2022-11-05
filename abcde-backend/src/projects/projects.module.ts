import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { Projects } from '../entities/projects/projects.entity';
import { ProjectsService } from './projects.service';
import { SectionConfigCols } from '../entities/sections/sectionConfigCols.entity';
import { Sections } from '../entities/sections/sections.entity';

@Module({
  providers: [ProjectsService],
  imports: [
    MikroOrmModule.forFeature({
      entities: [Projects, Sections, SectionConfigCols],
    }),
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}

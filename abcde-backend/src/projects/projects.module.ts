import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { Projects } from '../entities/projects.entity';
import { ProjectsService } from './projects.service';

@Module({
  providers: [ProjectsService],
  imports: [MikroOrmModule.forFeature({ entities: [Projects] })],
  exports: [ProjectsService],
})
export class ProjectsModule {}

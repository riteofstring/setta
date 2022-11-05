import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CodeInfoModule } from 'src/codeInfo/codeInfo.module';
import { ProjectsModule } from 'src/projects/projects.module';
import { UsersModule } from 'src/users/users.module';
import { AppController } from './app.controller';

@Module({
  imports: [AuthModule, UsersModule, ProjectsModule, CodeInfoModule],
  controllers: [AppController],
})
export class AppModule {}

import { AuthModule } from '#auth/auth.module';
import { CodeInfoModule } from '#codeInfo/codeInfo.module';
import { ProjectsModule } from '#projects/projects.module';
import { UsersModule } from '#users/users.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [AuthModule, UsersModule, ProjectsModule, CodeInfoModule],
  controllers: [AppController],
})
export class AppModule {}

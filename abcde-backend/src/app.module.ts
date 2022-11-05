import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CodeGeneratorModule } from 'src/codeGenerator/codeGenerator.module';
import { CodeInfoModule } from 'src/codeInfo/codeInfo.module';
import { ProjectsModule } from 'src/projects/projects.module';
import { UsersModule } from 'src/users/users.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProjectsModule,
    CodeInfoModule,
    CodeGeneratorModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

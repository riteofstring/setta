import { MikroOrmModule, MikroOrmMiddleware } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [AuthModule, UsersModule, ProjectsModule, MikroOrmModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})

// https://github.com/mikro-orm/nestjs-realworld-example-app/blob/master/src/app.module.ts
export class AppModule implements NestModule {
  // for some reason the auth middlewares in profile and article modules are fired before the request context one,
  // so they would fail to access contextual EM. by registering the middleware directly in AppModule, we can get
  // around this issue
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MikroOrmMiddleware).forRoutes('*');
  }
}

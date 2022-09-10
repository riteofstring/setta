import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { Users } from '../entities/users.entity';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  imports: [MikroOrmModule.forFeature({ entities: [Users] })],
  exports: [UsersService],
})
export class UsersModule {}

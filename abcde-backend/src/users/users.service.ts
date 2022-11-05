import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(username: string): Promise<any> {
    return await this.prisma.user.findUnique({ where: { name: username } });
  }

  async usernameTaken(username: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { name: username } });
    return count > 0;
  }

  async create(username: string, password: string) {
    const isTaken = await this.usernameTaken(username);
    if (isTaken) {
      throw new HttpException(
        {
          message: 'Input data validation failed',
          errors: { username: 'Username and email must be unique.' },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.prisma.user.create({
      data: { name: username, password },
    });
  }
}

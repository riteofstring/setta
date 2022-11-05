import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { validate } from 'class-validator';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findOne(username: string): Promise<any> {
    return this.usersRepository.findOne({ name: username });
  }

  async usernameTaken(username: string): Promise<boolean> {
    const count = await this.usersRepository.count({ name: username });
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

    // create new user
    const user = this.usersRepository.create({ name: username, password });
    const errors = await validate(user);

    if (errors.length > 0) {
      throw new HttpException(
        {
          message: 'Input data validation failed',
          errors: { username: 'Userinput is not valid.' },
        },
        HttpStatus.BAD_REQUEST,
      );
    } else {
      await this.usersRepository.persistAndFlush(user);
      return user;
    }
  }
}

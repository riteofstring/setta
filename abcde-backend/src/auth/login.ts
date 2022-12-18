// import { Injectable } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { UsersService } from 'src/users/users.service';

// @Injectable()
// export class AuthService {
//   constructor(
//     private usersService: UsersService,
//     private jwtService: JwtService,
//   ) {}

//   async validateUser(username: string, pass: string): Promise<any> {
//     const user = await this.usersService.findOne(username);
//     if (user && user.password === pass) {
//       const { password, ...result } = user;
//       return result;
//     }
//     return null;
//   }

//   // called after guard
//   async login(user: any) {
//     const payload = { name: user.name, sub: user.id };
//     return {
//       access_token: this.jwtService.sign(payload),
//     };
//   }

//   // called without guard
//   async register(userInfo: any) {
//     const { username, password } = userInfo;
//     return await this.usersService
//       .create(username, password)
//       .then((user) => {
//         return this.login(user);
//       })
//       .catch((e) => {
//         throw e;
//       });
//   }
// }

import crypto from 'crypto';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import { prisma } from 'src/prisma';
import { hashPasswordAsync } from './utils';

async function verify(username, password, doneFn) {
  const user = await prisma.user.findUnique({ where: { name: username } });
  if (!user) {
    return doneFn(null, false);
  }
  checkHash(password, user, doneFn);
}

function checkHash(password, user, doneFn) {
  hashPasswordAsync(password, user.salt, getCompareHashFn(user, doneFn));
}

function getCompareHashFn(user, doneFn) {
  return (err, hashedPassword) => {
    if (err) {
      return doneFn(err);
    }
    if (!crypto.timingSafeEqual(Buffer.from(user.password), hashedPassword)) {
      return doneFn(null, false, {
        message: 'Incorrect username or password.',
      });
    }
    return doneFn(null, user);
  };
}

passport.use(new LocalStrategy(verify));

export function login(...args) {
  passport.authenticate('local')(...args);
}

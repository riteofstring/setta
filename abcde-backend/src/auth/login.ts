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
import { BasicStrategy } from 'passport-http';
import { prisma } from 'src/prisma';
import { hashPassword } from './utils';

async function verify(username, password, done) {
  const user = await prisma.user.findUnique({ where: { name: username } });
  if (!user) {
    return done(null, false);
  }
  checkHash(password, user, done);
}

function checkHash(password, user, done) {
  try {
    const hashedPassword = hashPassword(password, user.salt);
    if (!crypto.timingSafeEqual(Buffer.from(user.password), hashedPassword)) {
      return done(null, false, {
        message: 'Incorrect username or password.',
      });
    }
  } catch (err) {
    return done(err);
  }
  return done(null, user);
}

passport.use(new BasicStrategy(verify));
passport.serializeUser(function (user, done) {
  console.log('serializeUser', user);
  done(null, user.id);
});
passport.deserializeUser(function (user, done) {
  console.log('deserializeUser', user);
  done(null, user);
});

function sendStatus(req, res) {
  if (req.isAuthenticated()) {
    res.sendStatus(200);
  }
}

export const login = [
  passport.authenticate('basic', { session: true, failWithError: true }),
  sendStatus,
];

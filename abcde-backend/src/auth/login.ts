import crypto from 'crypto';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import { prisma } from 'src/prisma';
import { sendStatusOnLogin } from 'src/utils/httpUtils';
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

passport.use(new LocalStrategy(verify));
passport.serializeUser((user, done) => {
  console.log('serializeUser', user);
  done(null, user.id);
});
passport.deserializeUser((user, done) => {
  console.log('deserializeUser', user);
  done(null, user);
});

export const login = [
  passport.authenticate('local', { session: true }),
  sendStatusOnLogin,
];

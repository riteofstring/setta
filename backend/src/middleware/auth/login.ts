import crypto from 'crypto';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import { loadUserByName } from 'src/db/user/load';
import { hashPassword } from 'src/utils/authUtils';
import { sendStatusOnLogin } from 'src/utils/httpUtils';

async function verify(username: string, password: string, done) {
  const user = await loadUserByName(username);
  if (!user) {
    return done(null, false);
  }
  checkHash(password, user, done);
}

function checkHash(password: string, user, done) {
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

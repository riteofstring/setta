import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import session from 'express-session';
import { prisma } from 'src/db/prisma';

export const sessionParser = session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  // cookie: {secure:true} //TODO uncomment this for production. It requires https, not http.
  store: new PrismaSessionStore(prisma, {
    checkPeriod: 2 * 60 * 1000, //ms
    dbRecordIdIsSessionId: true,
    dbRecordIdFunction: undefined,
  }),
});

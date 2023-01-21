import { FRONTEND } from 'abcde-utils/src/addresses';
import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import passport from 'passport';
import { router } from './routers';
import { sessionParser } from './sessionParser';

export const app = express();
export const passportSession = passport.session();

app.use(
  cors({
    origin: FRONTEND,
    credentials: true,
  }),
);
app.use(express.json({ limit: '5MB' }));
app.use(sessionParser);

app.use(passport.initialize());
app.use(passportSession);
app.use('/', router);

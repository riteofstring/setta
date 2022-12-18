import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import session from 'express-session';
import passport from 'passport';
import { router } from './routers';

const app = express();
const port = 8000;

app.use(
  cors({
    origin: 'http://127.0.0.1:3000',
    credentials: true,
  }),
);
app.use(express.json({ limit: '5MB' }));
app.use(
  session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    // cookie: {secure:true}
  }),
);

app.use(passport.initialize());
app.use((req, res, next) => {
  console.log('authenticating session');
  passport.authenticate('session')(req, res, next);
});
app.use('/', router);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

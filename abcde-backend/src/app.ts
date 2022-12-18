import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { router } from './routers';

const app = express();
const port = 8000;

app.use(express.json());
app.use(
  session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
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

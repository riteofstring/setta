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
    cookie: { secure: true },
  }),
);
app.use(passport.authenticate('session'));
app.use('/', router);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

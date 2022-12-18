import cors from 'cors';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { router } from './routers';

const app = express();
const port = 8000;
// const hostname = `http://localhost:${port}`;

app.use(
  cors({
    origin: 'http://127.0.0.1:3000',
    credentials: true,
    exposedHeaders: ['set-cookie'],
  }),
);
app.use(express.json());
app.use(
  session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    // cookie: {secure:true}
  }),
);
// app.use(function (req, res, next) {
//   res.header('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
//   res.header('Access-Control-Allow-Credentials', true);
//   res.header(
//     'Access-Control-Allow-Headers',
//     'Origin, X-Requested-With, Content-Type, Accept',
//   );
//   next();
// });

app.use(passport.initialize());
app.use((req, res, next) => {
  console.log('authenticating session');
  passport.authenticate('session')(req, res, next);
});
app.use('/', router);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

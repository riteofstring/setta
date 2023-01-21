import session from 'express-session';

export const sessionParser = session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  // cookie: {secure:true}
});

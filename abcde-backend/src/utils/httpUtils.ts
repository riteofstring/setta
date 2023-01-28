import { DOMAIN } from 'abcde-utils/src/addresses';

export function sendStatusOnLogin(req, res) {
  if (req.isAuthenticated()) {
    res.json({ username: req.user.name }).status(200);
    return;
  }
  res.sendStatus(401);
}

export function sendStatusOnLogout(req, res) {
  res.clearCookie('connect.sid', { domain: DOMAIN, path: '/' });
  req.session.destroy();
  res.sendStatus(200);
}

export function sendStatusOnLogin(req, res, next) {
  if (req.isAuthenticated()) {
    res.sendStatus(200);
    return;
  }
  next();
}

export function sendStatusOnLogout(req, res, next) {
  if (!req.isAuthenticated()) {
    res.sendStatus(200);
    return;
  }
  next();
}

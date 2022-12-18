export function sendStatusOnLogin(req, res, next) {
  if (req.isAuthenticated()) {
    res.sendStatus(200);
    return;
  }
  next();
}

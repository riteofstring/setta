export function sendStatusOnLogin(req, res) {
  if (req.isAuthenticated()) {
    res.sendStatus(200);
    return;
  }
  res.sendStatus(401);
}

export function sendStatusOnLogout(req, res) {
  res.sendStatus(200);
}

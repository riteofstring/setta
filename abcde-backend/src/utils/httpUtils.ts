export function sendStatusOnLogin(req, res) {
  if (req.isAuthenticated()) {
    res.json({ username: req.user.name }).status(200);
    return;
  }
  res.sendStatus(401);
}

export function sendStatusOnLogout(req, res) {
  res.sendStatus(200);
}

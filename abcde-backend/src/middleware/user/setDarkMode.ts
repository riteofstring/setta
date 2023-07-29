import { dbSetDarkMode } from 'src/db/user/setDarkMode';

export async function setDarkMode(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  await dbSetDarkMode({
    userId,
    darkMode: req.body.darkMode,
  });
  res.sendStatus(200);
}

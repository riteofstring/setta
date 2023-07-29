import { dbSetDarkMode } from 'src/db/user/setDarkMode';
import { getUserIdOrFail } from '../utils';

export async function setDarkMode(req, res) {
  const userId = getUserIdOrFail(req);
  await dbSetDarkMode({
    userId,
    darkMode: req.body.darkMode,
  });
  res.sendStatus(200);
}

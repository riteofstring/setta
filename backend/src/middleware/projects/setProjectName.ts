import { dbSetProjectName } from 'src/db/projects/setProjectName';
import { getUserIdOrFail } from '../utils';

export async function setProjectName(req, res) {
  const userId = getUserIdOrFail(req);
  await dbSetProjectName(
    userId,
    req.body.currProjectName,
    req.body.newProjectName,
  );
  res.sendStatus(200);
}

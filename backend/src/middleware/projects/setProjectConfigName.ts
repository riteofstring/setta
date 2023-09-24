import { dbSetProjectConfigName } from 'src/db/projectConfigs/setProjectConfigName';
import { getUserIdOrFail } from '../utils';

export async function setProjectConfigName(req, res) {
  const userId = getUserIdOrFail(req);
  await dbSetProjectConfigName(
    userId,
    req.body.projectId,
    req.body.currProjectConfigName,
    req.body.newProjectConfigName,
  );
  res.sendStatus(200);
}

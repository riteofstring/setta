import { dbSetProjectConfigName } from 'src/db/projectConfigs/setProjectConfigName';

export async function setProjectConfigName(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  console.log('req.body', req.body);

  await dbSetProjectConfigName(
    userId,
    req.body.projectId,
    req.body.currProjectConfigName,
    req.body.newProjectConfigName,
  );
  res.sendStatus(200);
}

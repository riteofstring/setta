import { dbSetProjectName } from 'src/db/projects/setProjectName';

export async function setProjectName(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  await dbSetProjectName(
    userId,
    req.body.currProjectName,
    req.body.newProjectName,
  );
  res.sendStatus(200);
}

import { saveProjectDetails } from './save';

async function save(userId, project): Promise<any> {
  await saveProjectDetails(userId, project);
}

export async function saveProject(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  await save(userId, req.body.project);
  res.sendStatus(200);
}

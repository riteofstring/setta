import { saveProjectDetails } from 'src/db/projects/save';

export async function saveProject(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  await saveProjectDetails(userId, req.body.project);
  res.sendStatus(200);
}

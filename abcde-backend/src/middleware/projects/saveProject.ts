import { saveProjectDetails } from 'src/db/projects/save';
import { getUserIdOrFail } from '../utils';

export async function saveProject(req, res) {
  const userId = getUserIdOrFail(req);
  await saveProjectDetails(userId, req.body.project);
  res.sendStatus(200);
}

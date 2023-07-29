import { createProject as createProjectFn } from 'src/db/projects/save';
import { getUserIdOrFail } from '../utils';

export async function createProject(req, res) {
  const userId = getUserIdOrFail(req);
  const project = await createProjectFn(userId, req.body.name);
  res.json(project);
}

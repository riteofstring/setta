import { createProject as createProjectFn } from 'src/db/projects/save';
import { uniqueName } from 'src/utils/utils';
import { getUserIdOrFail } from '../utils';

export async function createProject(req, res) {
  const userId = getUserIdOrFail(req);
  const name = req.body.name ?? uniqueName();
  const project = await createProjectFn(userId, name);
  res.json(project);
}

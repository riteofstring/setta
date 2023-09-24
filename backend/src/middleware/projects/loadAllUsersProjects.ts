import { loadAllUsersProjects as loadAllUsersProjectsFn } from 'src/db/projects/load';
import { getUserIdOrFail } from '../utils';

export async function loadAllUsersProjects(req, res) {
  const ownerId = getUserIdOrFail(req);
  const { projectId, format } = req.body;
  const projects = await loadAllUsersProjectsFn({ ownerId, projectId, format });
  res.json(projects);
}

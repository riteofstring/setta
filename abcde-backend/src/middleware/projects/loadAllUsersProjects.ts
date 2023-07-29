import { loadAllUsersProjects as loadAllUsersProjectsFn } from 'src/db/projects/load';
import { getUserIdOrFail } from '../utils';

export async function loadAllUsersProjects(req, res) {
  const ownerId = getUserIdOrFail(req);
  const projects = await loadAllUsersProjectsFn(ownerId);
  res.json(projects);
}

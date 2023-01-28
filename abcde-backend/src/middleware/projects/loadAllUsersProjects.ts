import { loadAllUsersProjects as loadAllUsersProjectsFn } from 'src/db/projects/load';

export async function loadAllUsersProjects(req, res) {
  const ownerId = req.user;
  if (!ownerId) {
    res.sendStatus(401);
    return;
  }
  const projects = await loadAllUsersProjectsFn(ownerId);
  res.json(projects);
}

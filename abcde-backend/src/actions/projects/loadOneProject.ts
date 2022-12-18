import { loadOne } from 'src/db/projects/load';

export async function loadOneProject(req, res) {
  const userId = req.user;
  const { id, configId } = req.params;
  const project = await loadOne(userId, id, configId);
  res.json(project).status(200);
}

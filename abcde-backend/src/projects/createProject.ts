import { createProject as createProjectFn } from './save';

export async function createProject(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const project = await createProjectFn(userId, req.body.name);
  res.json(project).status(200);
}

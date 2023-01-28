import { loadOne } from 'src/db/projects/load';

export async function loadOneProject(req, res) {
  const reqUserId = req.user;
  const { username, projectName, configName } = req.params;
  const project = await loadOne({
    reqUserId,
    username,
    projectName,
    configName,
  });
  res.json(project).status(200);
}

import { loadOne } from 'src/db/projects/load';
import { getUserIdOrFail } from '../utils';

export async function loadOneProject(req, res) {
  const reqUserId = getUserIdOrFail(req);
  const { username, projectName, configName } = req.params;
  const project = await loadOne({
    reqUserId,
    username,
    projectName,
    configName,
  });
  res.json(project);
}

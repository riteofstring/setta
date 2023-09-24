import { saveAsNewProjectConfig as saveAsNewProjectConfigFn } from 'src/db/projectConfigs/saveAs';
import { getUserIdOrFail } from '../utils';

export async function saveAsNewProjectConfig(req, res) {
  const userId = getUserIdOrFail(req);
  const { project, newConfigName } = req.body;
  const savedProject = await saveAsNewProjectConfigFn(
    userId,
    project,
    newConfigName,
  );
  res.json(savedProject);
}

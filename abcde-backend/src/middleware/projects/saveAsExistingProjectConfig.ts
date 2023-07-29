import { saveAsExistingProjectConfig as saveAsExistingProjectConfigFn } from 'src/db/projectConfigs/saveAs';
import { getUserIdOrFail } from '../utils';

export async function saveAsExistingProjectConfig(req, res) {
  const userId = getUserIdOrFail(req);
  const { project, configName } = req.body;
  const savedProject = await saveAsExistingProjectConfigFn(
    userId,
    project,
    configName,
  );
  res.json(savedProject);
}

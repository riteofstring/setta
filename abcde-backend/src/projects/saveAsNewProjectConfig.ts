import { saveAsNewProjectConfig as saveAsNewProjectConfigFn } from 'src/projectConfigs/saveAs';

export async function saveAsNewProjectConfig(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const { project, newConfigName } = req.body;
  return await saveAsNewProjectConfigFn(userId, project, newConfigName);
}

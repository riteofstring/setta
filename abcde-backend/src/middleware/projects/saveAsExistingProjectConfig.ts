import { saveAsExistingProjectConfig as saveAsExistingProjectConfigFn } from 'src/db/projectConfigs/saveAs';

export async function saveAsExistingProjectConfig(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const { project, configName } = req.body;
  const savedProject = await saveAsExistingProjectConfigFn(
    userId,
    project,
    configName,
  );
  res.json(savedProject);
}

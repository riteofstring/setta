import { saveAsExistingProjectConfig as saveAsExistingProjectConfigFn } from 'src/db/projectConfigs/saveAs';

export async function saveAsExistingProjectConfig(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const { project, configId } = req.body;
  const savedProject = await saveAsExistingProjectConfigFn(
    userId,
    project,
    configId,
  );
  res.json(savedProject).status(200);
}

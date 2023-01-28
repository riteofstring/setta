import { saveGeneratedCode } from 'src/db/runs/saveCode';
import { generateCode as fnGenerateCode } from './codeGenerator';
import { exportSelected } from './exportSelected';

export async function generateCode(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const { project, codeId } = req.body;
  const codeJson = exportSelected(project);
  const code = fnGenerateCode(codeJson);
  await saveGeneratedCode({
    id: codeId,
    ownerId: userId,
    projectConfigId: project.projectConfig.id,
    code,
  });
  res.json(project);
}

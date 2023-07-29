import { saveGeneratedCode } from 'src/db/runs/saveCode';
import { getUserIdOrFail } from '../utils';
import { generateCode as fnGenerateCode } from './codeGenerator';
import { exportSelected } from './exportSelected';

export async function generateCode(req, res) {
  const userId = getUserIdOrFail(req);
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

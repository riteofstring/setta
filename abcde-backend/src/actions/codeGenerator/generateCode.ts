import { saveGeneratedCode } from 'src/db/codeGenerator/save';
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
  await saveGeneratedCode({ id: codeId, ownerId: userId, code });
  res.json(project).status(200);
}

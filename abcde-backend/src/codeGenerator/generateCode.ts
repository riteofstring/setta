import { prisma } from 'src/prisma';
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
  await prisma.generatedCode.create({
    data: { id: codeId, ownerId: userId, code },
    select: { id: true },
  });
  res.json(project).status(200);
}

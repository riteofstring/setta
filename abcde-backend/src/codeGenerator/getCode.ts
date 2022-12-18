import { prisma } from 'src/prisma';

export async function getCode(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const code = await prisma.generatedCode.findFirst({
    where: { id: req.body.codeId, ownerId: userId },
    select: { code: true },
  });
  res.json(code).status(200);
}

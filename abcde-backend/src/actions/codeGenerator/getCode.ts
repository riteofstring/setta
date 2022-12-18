import { loadCode } from 'src/db/codeGenerator/load';

export async function getCode(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const code = loadCode({ id: req.body.codeId, ownerId: userId });
  res.json(code).status(200);
}

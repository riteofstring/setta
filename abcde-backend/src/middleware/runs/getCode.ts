import { loadCode } from 'src/db/runs/loadCode';

async function _getCode(req, res) {
  const userId = req.user;
  const codeId = req.body.codeId;
  if (!userId || !codeId) {
    res.sendStatus(401);
    return;
  }
  const code = await loadCode({ id: codeId, ownerId: userId });
  res.json(code);
}

function errorHandler(err, req, res, next) {
  if (err.name === 'NotFoundError') {
    res.sendStatus(404);
    return;
  }
  // Inconsistent column data
  if (err.code === 'P2023') {
    res.sendStatus(422);
    return;
  }
  next(err);
}

export const getCode = [_getCode, errorHandler];

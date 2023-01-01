import { loadCode } from 'src/db/codeGenerator/load';

async function _getCode(req, res) {
  const userId = req.user;
  if (!userId) {
    res.sendStatus(401);
    return;
  }
  const code = await loadCode({ id: req.body.codeId, ownerId: userId });
  res.json(code).status(200);
}

function errorHandler(err, req, res, next) {
  if (err.name === 'NotFoundError') {
    res.sendStatus(404);
    return;
  }
  next(err);
}

export const getCode = [_getCode, errorHandler];

import { getPathnameFromProjectConfigId } from 'src/db/projectConfigs/load';
import { loadCode } from 'src/db/runs/loadCode';
import { getUserIdOrFail } from '../utils';

async function _getCode(req, res) {
  const userId = getUserIdOrFail(req);
  const codeId = req.body.codeId;
  if (!codeId) {
    res.sendStatus(401);
    return;
  }
  const { code, projectConfigId } = await loadCode({
    id: codeId,
    ownerId: userId,
  });
  const location = await getPathnameFromProjectConfigId(projectConfigId);
  res.json({ code, location });
}

function errorHandler(err, req, res, next) {
  if (err.name === 'NotFoundError') {
    res.sendStatus(404);
    return;
  }
  // Inconsistent column data (probably caused by invalid codeId)
  if (err.code === 'P2023') {
    res.sendStatus(422);
    return;
  }
  next(err);
}

export const getCode = [_getCode, errorHandler];

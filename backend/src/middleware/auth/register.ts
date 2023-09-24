import { AuthType } from 'abcde-utils/src/types/auth';
import { createUser } from 'src/db/user/save';
import { sendStatusOnLogin } from 'src/utils/httpUtils';

async function createAndLogin(req, res, next) {
  const { username, password }: AuthType = req.body;
  const user = await createUser({ name: username, password });
  // pass 'next' as callback, to pass error onto errorhandler
  req.login(user, next);
}

function errorHandler(err, req, res, next) {
  // unique constraint error
  if (err.code === 'P2002') {
    res.status(409).send({
      message: 'Username taken',
    });
    return;
  }
  next(err);
}

export const register = [createAndLogin, sendStatusOnLogin, errorHandler];

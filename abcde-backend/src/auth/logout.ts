import { sendStatusOnLogout } from 'src/utils/httpUtils';

function callLogout(req, res, next) {
  req.logout(next);
}

export const logout = [callLogout, sendStatusOnLogout];

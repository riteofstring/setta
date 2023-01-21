import { sendToUser } from 'src/server';

export function logData(req, res, next) {
  sendToUser(req.user, req.body);
  res.sendStatus(200);
}

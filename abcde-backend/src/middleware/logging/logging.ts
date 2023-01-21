import { sendToUser } from 'src/server';

export function logData(req, res, next) {
  console.log('logData', req.body);
  sendToUser(req.user, req.body);
  res.sendStatus(200);
}

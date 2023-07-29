const noUserIdMessage = 'No UserId';

export function getUserIdOrFail(req) {
  const userId = req.user;
  if (!userId) {
    throw new Error(noUserIdMessage);
  }
  return userId;
}

export function noUserIdErrorHandler(err, req, res, next) {
  if (err.message === noUserIdMessage) {
    res.sendStatus(401);
    return;
  }
  next(err);
}

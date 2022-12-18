import { createUser } from 'src/users/save';

export async function register(req, res, next) {
  const { username, password }: { username: string; password: string } =
    req.body;
  try {
    const user = await createUser({ name: username, password });
    console.log('user', user);
    req.login({ id: user.id }, function (err) {
      if (err) {
        return next(err);
      }
      res.sendStatus(200);
    });
  } catch (err) {
    // unique constraint error
    if (err.code === 'P2002') {
      res.status(409).send({
        message: 'Username taken',
      });
      return;
    }
  }
}

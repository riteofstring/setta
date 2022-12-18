import { Prisma, User } from '@prisma/client';
import { createUser } from 'src/db/user/save';
import { createSalt, hashPassword } from 'src/utils/authUtils';
import { prismaMock } from 'test/prismaMock';

test('should create new user ', async () => {
  const user = { name: 'Rich', password: '123' };
  const salt = createSalt();
  const finalUser = {
    ...user,
    salt,
    password: hashPassword(user.password, salt),
  } as unknown as Prisma.Prisma__UserClient<User>;

  prismaMock.user.create.mockResolvedValue(finalUser);

  await createUser(user);

  console.log(prismaMock.user.findFirst({}));
});

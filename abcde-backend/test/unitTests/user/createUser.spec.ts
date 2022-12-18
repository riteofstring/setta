import { prisma } from 'src/db/prisma';
import { createUser } from 'src/db/user/save';
import { hashPassword } from 'src/utils/authUtils';
import { clearDb } from 'test/clearDb';

describe('createUser', () => {
  const info = { name: 'Tom', password: 'abcd' };

  beforeAll(async () => {
    await clearDb();
  });

  test('create user', async () => {
    await createUser(info);
    const users = await prisma.user.findMany({});
    expect(users.length).toEqual(1);
    expect(users[0].name).toEqual('Tom');
  });

  test('password should be hashed', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { name: info.name },
    });
    expect(user.password).toEqual(hashPassword(info.password, user.salt));
  });

  test('user cannot be created again', async () => {
    await expect(createUser(info)).rejects.toThrow();
  });
});

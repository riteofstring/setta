import { prisma } from 'src/db/prisma';
import { loadUser } from 'src/db/user/load';
import { createUser, updateUser } from 'src/db/user/save';
import { hashPassword } from 'src/utils/authUtils';
import { clearDb } from 'test/clearDb';

describe('Create and Update User', () => {
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
    const user = await loadUser(info.name);
    expect(user.password).toEqual(hashPassword(info.password, user.salt));
  });

  test('user cannot be created again', async () => {
    await expect(createUser(info)).rejects.toThrow();
  });

  test('update user password', async () => {
    const newInfo = { ...info, password: '9000' };
    const newUser = await updateUser(newInfo);
    expect(newUser.password).toEqual(
      hashPassword(newInfo.password, newUser.salt),
    );
  });
});

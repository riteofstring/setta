import { prisma } from 'src/db/prisma';
import { createUser } from 'src/db/user/save';
import { clearDb } from 'test/clearDb';

describe('exportSelected', () => {
  beforeAll(async () => {
    await clearDb();
  });

  test('create user', async () => {
    const info = { name: 'Tom', password: 'abcd' };
    await createUser(info);
    const users = await prisma.user.findMany({});
    expect(users.length).toEqual(1);
    expect(users[0].name).toEqual('Tom');
  });
});

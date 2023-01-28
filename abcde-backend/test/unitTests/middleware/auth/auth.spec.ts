import { LOGIN, LOGOUT, REGISTER } from 'abcde-utils/src/routes';
import app from 'src/app';
import supertest from 'supertest';
import { clearDb } from 'test/clearDb';

describe('Register, login, logout', () => {
  let request;
  let server;

  beforeAll(async () => {
    await clearDb();
    server = app.listen();
    request = supertest.agent(server);
  });

  afterAll(async () => {
    await server.close();
  });

  test('Register', async () => {
    await request
      .post(REGISTER)
      .send({ username: 'Kevin', password: '123' })
      .expect(200);
  });

  test('Try registering existing username', async () => {
    await request
      .post(REGISTER)
      .send({ username: 'Kevin', password: '456' })
      .expect(409);
  });

  test('Logout', async () => {
    await request.post(LOGOUT).expect(200);
  });

  test('Login should fail with incorrect password', async () => {
    await request
      .post(LOGIN)
      .send({ username: 'Kevin', password: '456' })
      .expect(401);
  });

  test('Login with correct password', async () => {
    await request
      .post(LOGIN)
      .send({ username: 'Kevin', password: '123' })
      .expect(200);
  });
});

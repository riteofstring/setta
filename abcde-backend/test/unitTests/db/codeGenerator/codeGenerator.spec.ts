import simpleExample from 'abcde-test/src/codegenData/simple';
import { generateCode } from 'src/middleware/codeGenerator/codeGenerator';
import { clearDb } from 'test/clearDb';

describe('generateCode', () => {
  beforeAll(async () => {
    await clearDb();
  });

  test('test generateCode function', () => {
    const code = generateCode(simpleExample);
    console.log(code);
  });
});

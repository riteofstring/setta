import { generateCode } from 'src/middleware/codeGenerator/codeGenerator';
import { clearDb } from 'test/clearDb';
import example1 from './example1';

describe('generateCode', () => {
  beforeAll(async () => {
    await clearDb();
  });

  test('test generateCode function', () => {
    const code = generateCode(example1);
    console.log(code);
  });
});

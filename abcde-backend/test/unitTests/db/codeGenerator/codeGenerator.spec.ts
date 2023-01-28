import { loadOneProject } from 'abcde-test/src/loadTestData';
import { generateCode } from 'src/middleware/codeGenerator/codeGenerator';
import { exportSelected } from 'src/middleware/codeGenerator/exportSelected';

describe('generateCode', () => {
  test('test generateCode function', async () => {
    const p = await loadOneProject({ forCodeGen: true });
    const selected = exportSelected(p);
    const code = generateCode(selected);
    console.log(code);
  });
});

import { loadTestData } from 'abcde-test/src/loaders/loaders';
import { generateCode } from 'src/middleware/runs/codeGenerator';
import { exportSelected } from 'src/middleware/runs/exportSelected';

describe('generateCode', () => {
  test('test generateCode function', async () => {
    const p = await loadTestData({
      projectName: 'simpleTrainTest',
      configName: 'simpleConfig1',
      format: 'codeGen',
    });
    const selected = exportSelected(p);
    const code = generateCode(selected);
    console.log(code);
  });
});

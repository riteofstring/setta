import { loadTestData } from 'abcde-test/src/loaders/loaders';
import { exportSelected } from 'src/middleware/runs/exportSelected';

describe('exportSelected', () => {
  test('export simpleTrainTest', async () => {
    const p = await loadTestData({
      projectName: 'simpleTrainTest',
      configName: 'simpleConfig1',
      format: 'codeGen',
    });
    const selected = exportSelected(p);
    console.log(selected);
  });
});

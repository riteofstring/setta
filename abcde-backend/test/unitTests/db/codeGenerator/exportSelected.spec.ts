import { loadOneProject } from 'abcde-test/src/loadTestData';
import { exportSelected } from 'src/middleware/codeGenerator/exportSelected';

describe('exportSelected', () => {
  test('export simpleTrainTest', async () => {
    const p = await loadOneProject({
      projectName: 'pytorchLightningMnist',
      subFolderName: 'mnistConfig1',
      forCodeGen: true,
    });
    const selected = exportSelected(p);
    console.log(selected);
  });
});

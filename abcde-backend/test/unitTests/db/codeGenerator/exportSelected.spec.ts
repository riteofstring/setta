import { loadOneProject } from 'abcde-test/src/loadTestData';
import { exportSelected } from 'src/middleware/codeGenerator/exportSelected';

describe('exportSelected', () => {
  test('export simpleTrainTest', async () => {
    const p = await loadOneProject({ forCodeGen: true });
    const selected = exportSelected(p);
    console.log(selected);
});

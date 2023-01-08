import { loadGlobalCodeInfo } from 'abcde-test/src/loadTestData';
import _ from 'lodash';
import {
  findAllCallables,
  findAllParameters,
} from 'src/db/codeInfo/infoFactory';

describe('find descendants', () => {
  test('find all callable descendants', async () => {
    const codeInfo = await loadGlobalCodeInfo();
    const collectionId = _.find(
      codeInfo,
      (x) => x.name === 'The Best Optimizers',
    ).id;
    const callables = findAllCallables(codeInfo, [collectionId]);
    expect(new Set(callables.map((x) => x.name))).toEqual(
      new Set(['SGD', 'Adam', 'Adadelta']),
    );
  });

  test('find all parameter descendants', async () => {
    const codeInfo = await loadGlobalCodeInfo();
    const objId = _.find(codeInfo, (x) => x.name === 'resnet101').id;
    const parameters = findAllParameters(codeInfo, [objId]);
    expect(new Set(parameters.map((x) => x.name))).toEqual(
      new Set(['pretrained', 'progress', 'kwargs']),
    );
  });
});

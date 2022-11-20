import { findAllCallables, findAllParameters } from 'src/codeInfo/infoFactory';
import { loadSpecificTestData } from 'test/utils';
import _ = require('lodash');

test('find all callable descendants', async () => {
  const codeInfo = await loadSpecificTestData({ name: 'AllCodeInfo' });
  const collectionId = _.filter(
    codeInfo,
    (x) => x.name === 'The Best Optimizers',
  )[0].id;
  const callables = findAllCallables(codeInfo, [collectionId]);
  expect(new Set(callables.map((x) => x.name))).toEqual(
    new Set(['SGD', 'Adam', 'Adadelta']),
  );
});

test('find all parameter descendants', async () => {
  const codeInfo = await loadSpecificTestData({ name: 'AllCodeInfo' });
  const objId = _.filter(codeInfo, (x) => x.name === 'resnet101')[0].id;
  const parameters = findAllParameters(codeInfo, [objId]);
  expect(new Set(parameters.map((x) => x.name))).toEqual(
    new Set(['pretrained', 'progress', 'kwargs']),
  );
});

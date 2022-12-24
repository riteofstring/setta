import { PARAMETER } from 'abcde-utils/src/constants';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { saveEV, saveEVCols } from 'src/db/enteredValues/save';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy entered value collections', () => {
  const _codeInfos = ['epochs', 'lr', 'batches'].map((name) => ({
    id: createNewId(),
    name,
    type: 'int',
    rcType: PARAMETER,
    parentId: null,
    defaultVal: '',
    version: '',
    description: '',
    path: '',
    inCodeParentId: null,
    children: [],
  }));
  const codeInfos = _.keyBy(_codeInfos, 'id');

  const _evs = [
    { id: createNewId(), value: '45', childId: null },
    { id: createNewId(), value: '100', childId: null },
    { id: createNewId(), value: '1234', childId: null },
  ];
  const evs = _.keyBy(_evs, 'id');

  const evCols = {};
  _.range(3).forEach(
    (x) => (evCols[createNewId()] = { [_codeInfos[x].id]: _evs[x].id }),
  );

  beforeAll(async () => {
    await clearDb();
  });

  test('Create an ev collection', async () => {
    await saveCodeInfo(codeInfos);
    await saveEV(evs);
    await saveEVCols(evCols);
  });
});

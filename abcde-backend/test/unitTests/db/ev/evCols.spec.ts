import { PARAMETER } from 'abcde-utils/src/constants';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { saveEV, saveEVCols } from 'src/db/enteredValues/save';
import { prisma } from 'src/db/prisma';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy entered value collections', () => {
  beforeAll(async () => {
    await clearDb();
  });

  test('Create an ev collection', async () => {
    await saveCodeInfo(codeInfos);
    await saveEV(evs);
    await saveEVCols(evCols);

    const evColId = await prisma.eVColId.findMany();
    expect(evColId).toEqual([{ id: Object.keys(evCols)[0] }]);

    const evCol = await prisma.eVCol.findMany();
    expect(new Set(evCol.map((x) => x.codeInfoId))).toEqual(
      new Set(_codeInfos.map((x) => x.id)),
    );
    expect(new Set(evCol.map((x) => x.evId))).toEqual(
      new Set(_evs.map((x) => x.id)),
    );
  });
});

// test data
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

const _evCols = {};
_.range(3).forEach((x) => (_evCols[_codeInfos[x].id] = _evs[x].id));
const evCols = { [createNewId()]: _evCols };

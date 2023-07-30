import { newCodeInfo } from 'abcde-utils/src/objs/codeInfo';
import { RCType } from 'abcde-utils/src/types/codeInfo';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { copyEVCols } from 'src/db/enteredValues/copy';
import { saveEVCols } from 'src/db/enteredValues/save';
import { prisma } from 'src/db/prisma';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy entered value collections', () => {
  beforeAll(async () => {
    await clearDb();
  });

  test('Create an ev collection', async () => {
    await saveCodeInfo(codeInfos);
    await saveEVCols(evCols);

    const evColId = await prisma.eVColId.findMany();
    expect(evColId).toEqual([{ id: originalEvColId }]);
    const evCol = await prisma.eVCol.findMany();
    expect(new Set(evCol.map((x) => x.codeInfoId))).toEqual(
      new Set(_codeInfos.map((x) => x.id)),
    );
  });

  test('Update an ev collection', async () => {
    // update the evcol so that it only has 2 evs
    const _newEvCols = {};
    _.range(2).forEach(
      (x) => (_newEvCols[_codeInfos[x].id] = (x + 10).toString()),
    );
    const newEvCols = { [originalEvColId]: _newEvCols };
    await saveEVCols(newEvCols);

    const evColId = await prisma.eVColId.findMany();
    expect(evColId).toEqual([{ id: originalEvColId }]);
    const evCol = await prisma.eVCol.findMany();
    expect(evCol.length).toEqual(2);
    expect(evCol.map((x) => x.value)).toEqual(['10', '11']);
  });

  test('Copy an ev collection', async () => {
    const { newEvCols, evColIdMap } = copyEVCols({
      evCols,
      kwargInfoIdMap: {},
    });
    const newEvColId = Object.keys(newEvCols)[0];
    expect(newEvColId).not.toEqual(originalEvColId);
    expect(evCols[originalEvColId]).toEqual(newEvCols[newEvColId]);
    expect(evColIdMap).toEqual({ [originalEvColId]: newEvColId });
  });
});

// test data
const _codeInfos = ['epochs', 'lr', 'batches'].map((name) =>
  newCodeInfo({
    name,
    rcType: RCType.PARAMETER,
  }),
);
const codeInfos = _.keyBy(_codeInfos, 'id');

const _evCols = {};
_.range(3).forEach((x) => (_evCols[_codeInfos[x].id] = x.toString()));
const evCols = { [createNewId()]: _evCols };

const originalEvColId = Object.keys(evCols)[0];

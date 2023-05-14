import { TEXT } from 'abcde-utils/src/constants';
import { newCodeInfo } from 'abcde-utils/src/objs/codeInfo';
import { newEV } from 'abcde-utils/src/objs/ev';
import { RCType } from 'abcde-utils/src/types/codeInfo';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { copyEV, copyEVCols } from 'src/db/enteredValues/copy';
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
    expect(evColId).toEqual([{ id: originalEvColId }]);
    const evCol = await prisma.eVCol.findMany();
    expect(new Set(evCol.map((x) => x.codeInfoId))).toEqual(
      new Set(_codeInfos.map((x) => x.id)),
    );
    expect(new Set(evCol.map((x) => x.evId))).toEqual(
      new Set(_evs.map((x) => x.id)),
    );
  });

  test('Update an ev collection', async () => {
    // update the evcol so that it only has 2 evs

    const _newEvCols = {};
    _.range(2).forEach((x) => (_newEvCols[_codeInfos[x].id] = _evs[x].id));
    const newEvCols = { [originalEvColId]: _newEvCols };
    await saveEVCols(newEvCols);

    const evColId = await prisma.eVColId.findMany();
    expect(evColId).toEqual([{ id: originalEvColId }]);
    const evCol = await prisma.eVCol.findMany();
    expect(evCol.length).toEqual(2);
  });

  test('Copy an ev collection', async () => {
    // copy evs and the evcol
    const { evIdMap } = copyEV(evs);
    const { newEvCols, evColIdMap } = copyEVCols(evCols, evIdMap);
    const newEvColId = Object.keys(newEvCols)[0];

    // codeInfoIds should stil match, but not evIds
    for (const [codeInfoId, newEvId] of Object.entries(newEvCols[newEvColId])) {
      const originalEvId = evCols[originalEvColId][codeInfoId];
      expect(originalEvId).toBeTruthy();
      expect(originalEvId).not.toEqual(newEvId);
    }

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

const _evs = [
  newEV({ uiType: TEXT }),
  newEV({ uiType: TEXT }),
  newEV({ uiType: TEXT }),
];
const evs = _.keyBy(_evs, 'id');

const _evCols = {};
_.range(3).forEach((x) => (_evCols[_codeInfos[x].id] = _evs[x].id));
const evCols = { [createNewId()]: _evCols };

const originalEvColId = Object.keys(evCols)[0];

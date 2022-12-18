import { loadSpecificTestData } from 'abcde-test/src/loadTestData';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { prisma } from 'src/db/prisma';
import { clearDb } from 'test/clearDb';

describe('Creating code info', () => {
  beforeAll(async () => {
    await clearDb();
  });

  test('Create collection and its children', async () => {
    let codeInfo = await loadSpecificTestData({ name: 'AllCodeInfo' });
    const collection = _.find(codeInfo, (x) => x.name === 'Various Params');
    // get collection's children
    codeInfo = {
      [collection.id]: collection,
      ..._.pickBy(codeInfo, (x) => collection.children.includes(x.id)),
    };
    await saveCodeInfo(codeInfo);
    const infoInDb = await prisma.codeInfo.findMany({});
    expect(new Set(infoInDb.map((x) => x.id))).toEqual(
      new Set([collection.id, ...collection.children]),
    );
  });
});

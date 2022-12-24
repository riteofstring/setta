import { loadSpecificTestData } from 'abcde-test/src/loadTestData';
import { SWITCH } from 'abcde-utils/src/constants';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { saveUITypes } from 'src/db/uiTypes/save';
import { seedUsers } from 'src/db/user/save';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy a ui type', () => {
  let uiType;
  let user;

  beforeAll(async () => {
    await clearDb();
    uiType = await loadSpecificTestData({ name: 'PresetUITypes' });
    uiType = _.find(uiType, (x) => x.type === SWITCH);
    user = await loadSpecificTestData({ name: 'Users' });
    user = _.find(user, (x) => x.name === 'Kevin');
  });

  test('create a ui type', async () => {
    await seedUsers({ [user.id]: user });
    await saveUITypes(user.id, { [uiType.id]: uiType });

    const uiTypes = await prisma.uIType.findMany();
    expect(uiTypes.map((x) => x.id)).toEqual([uiType.id]);

    const switchUITypes = await prisma.switchUIType.findMany();
    expect(switchUITypes.map((x) => x.idid)).toEqual([uiType.id]);
  });
});

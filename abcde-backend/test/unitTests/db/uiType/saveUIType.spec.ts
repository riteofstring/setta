import { loadSpecificTestData } from 'abcde-test/src/loadTestData';
import { SLIDER } from 'abcde-utils/src/constants';
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
    uiType = _.find(uiType, (x) => x.type === SLIDER);
    user = await loadSpecificTestData({ name: 'Users' });
    user = _.find(user, (x) => x.name === 'Kevin');
  });

  test('create a ui type', async () => {
    await seedUsers({ [user.id]: user });
    await saveUITypes(user.id, { [uiType.id]: uiType });

    const uiTypes = await prisma.uIType.findMany();
    expect(uiTypes.map((x) => x.id)).toEqual([uiType.id]);

    const sliderUITypes = await prisma.sliderUIType.findMany();
    expect(sliderUITypes.map((x) => x.idid)).toEqual([uiType.id]);
    expect(_.pick(sliderUITypes[0], ['min', 'max', 'step'])).toEqual({
      min: 10,
      max: 100,
      step: 10,
    });
  });

  test('update a ui type', async () => {
    const updated = { ...uiType };
    const newConfig = { min: 100, max: 2000, step: 20 };
    updated.config = newConfig;
    await saveUITypes(user.id, { [updated.id]: updated });

    const uiTypes = await prisma.uIType.findMany();
    expect(uiTypes.map((x) => x.id)).toEqual([updated.id]);

    const sliderUITypes = await prisma.sliderUIType.findMany();
    expect(sliderUITypes.map((x) => x.idid)).toEqual([updated.id]);
    expect(_.pick(sliderUITypes[0], ['min', 'max', 'step'])).toEqual(newConfig);
  });
});

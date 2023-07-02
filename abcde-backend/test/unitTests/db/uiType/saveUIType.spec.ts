import { loadSpecificTestData } from 'abcde-test/src/loaders/helpers';
import { SLIDER } from 'abcde-utils/src/constants';
import _ from 'lodash';
import { getUITypesByWhere } from 'src/db/uiTypes/load';
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

    const uiTypes = await getUITypesByWhere({});
    expect(_.map(uiTypes, (x) => x.id)).toEqual([uiType.id]);

    expect(Object.values(uiTypes)[0]['config']).toEqual({
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

    const uiTypes = await getUITypesByWhere({});
    expect(_.map(uiTypes, (x) => x.id)).toEqual([updated.id]);

    expect(Object.values(uiTypes)[0]['config']).toEqual(newConfig);
  });
});

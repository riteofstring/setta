import {
  loadGlobalCodeInfo,
  loadSpecificTestData,
} from 'abcde-test/src/loaders/helpers';
import { newSectionInfo } from 'abcde-utils/src/objs/sectionInfo';
import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { saveCodeInfo } from 'src/db/codeInfo/save';
import { saveSections } from 'src/db/sections/save';
import { saveUITypes } from 'src/db/uiTypes/save';
import { seedUsers } from 'src/db/user/save';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy a section ui type', () => {
  let uiType, user, codeInfo;

  const section = newSectionInfo({
    id: createNewId(),
    name: 'New Section',
    paramInfoId: null,
    sectionChildrenId: createNewId(),
    size: { width: 100, height: 100 },
  });

  beforeAll(async () => {
    await clearDb();
    const loadProps = {
      projectName: 'simpleTrainTest',
      configName: 'simpleConfig1',
    };
    uiType = await loadSpecificTestData({ name: 'UITypes', ...loadProps });
    uiType = _.find(uiType, (x) => x.name === 'Model');
    uiType.originInfoId.sectionId = section.id;
    user = await loadSpecificTestData({ name: 'Users' });
    user = _.find(user, (x) => x.name === 'Kevin');
    codeInfo = await loadGlobalCodeInfo();
  });

  test('create a section ui type', async () => {
    await saveCodeInfo(codeInfo);
    await seedUsers({ [user.id]: user });
    await saveSections({ [section.id]: section }, { [section.id]: [] });
    await saveUITypes(user.id, { [uiType.id]: uiType });

    // const uiTypes = await prisma.uIType.findMany();
    // expect(uiTypes.map((x) => x.id)).toEqual([uiType.id]);

    // const sliderUITypes = await prisma.sliderUIType.findMany();
    // expect(sliderUITypes.map((x) => x.idid)).toEqual([uiType.id]);
    // expect(_.pick(sliderUITypes[0], ['min', 'max', 'step'])).toEqual({
    //   min: 10,
    //   max: 100,
    //   step: 10,
    // });
  });
});

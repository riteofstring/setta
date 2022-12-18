import { createNewId } from 'abcde-utils/src/utils';
import _ from 'lodash';
import { copyEV } from 'src/db/enteredValues/copy';
import { saveEV } from 'src/db/enteredValues/save';
import { prisma } from 'src/db/prisma';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy entered value', () => {
  const info = { id: createNewId(), value: '25', childId: null };

  beforeAll(async () => {
    await clearDb();
  });

  test('create ev', async () => {
    await saveEV({ [info.id]: info });
    const ev = await prisma.eV.findFirstOrThrow({ where: { id: info.id } });
    expect(ev.value).toEqual(info.value);
  });

  test('update ev', async () => {
    const updatedEV = { ...info, value: null };
    await saveEV({ [info.id]: updatedEV });
    const ev = await prisma.eV.findFirstOrThrow({ where: { id: info.id } });
    expect(ev.value).toBeNull();
  });

  test('copy ev', async () => {
    const { newEv } = copyEV({ [info.id]: info });
    const copied = Object.values(newEv)[0];
    expect(copied.id).not.toEqual(info.id);
    expect(_.pick(copied, ['value', 'childId'])).toEqual(
      _.pick(info, ['value', 'childId']),
    );
  });
});

import { createNewId } from 'abcde-utils/src/utils';
import { copyEV } from 'src/db/enteredValues/copy';
import { saveEV } from 'src/db/enteredValues/save';
import { prisma } from 'src/db/prisma';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy entered value', () => {
  const evId = createNewId();
  const info = { value: '25', childId: null };

  beforeAll(async () => {
    await clearDb();
  });

  test('create ev', async () => {
    await saveEV({ [evId]: info });
    const ev = await prisma.eV.findFirstOrThrow({ where: { id: evId } });
    expect(ev.value).toEqual(info.value);
  });

  test('update ev', async () => {
    const updatedEV = { ...info, value: null };
    await saveEV({ [evId]: updatedEV });
    const ev = await prisma.eV.findFirstOrThrow({ where: { id: evId } });
    expect(ev.value).toBeNull();
  });

  test('copy ev', async () => {
    const { newEv, evIdMap } = copyEV({ [evId]: info });
    const copiedId = Object.keys(newEv)[0];
    const copiedInfo = Object.values(newEv)[0];
    expect(copiedId).not.toEqual(evId);
    expect(copiedInfo).toEqual(info);
    expect(evIdMap).toEqual({ [evId]: copiedId });
  });
});

import { createNewId } from 'abcde-utils/src/utils';
import { copyEV } from 'src/db/enteredValues/copy';
import { saveEV } from 'src/db/enteredValues/save';
import { prisma } from 'src/db/prisma';
import { clearDb } from 'test/clearDb';

describe('Create, update, and copy entered value', () => {
  const info = { id: createNewId(), value: "25" };

  beforeAll(async () => {
    await clearDb();
  });

  test('create ev', async () => {
    await saveEV({ [info.id]: info.value });
    const ev = await prisma.eV.findFirstOrThrow({ where: { id: info.id } });
    expect(ev.value).toEqual(info.value);
  });

  test('update ev', async () => {
    const updatedEV = { ...info, value: null };
    await saveEV({ [updatedEV.id]: updatedEV.value });
    const ev = await prisma.eV.findFirstOrThrow({ where: { id: info.id } });
    expect(ev.value).toBeNull();
  });

  test('copy ev', async () => {
    const { newEv, evIdMap } = copyEV({ [info.id]: info.value });
    expect(evIdMap[info.id]).not.toEqual(info.id);
    expect(newEv[evIdMap[info.id]]).toEqual(info.value);
  });
});

import { prisma } from 'src/db/prisma';
import { sendToUserByLocation } from 'src/websocket/utils';

async function findIds(runId, group, key) {
  const result = await prisma.outputGroup.findUnique({
    where: { name_runId: { name: group, runId } },
    select: {
      id: true,
      children: { where: { name: key }, select: { id: true } },
    },
  });

  let groupId = result?.id;
  let keyId = result?.children[0]?.id;

  if (!groupId) {
    const newGroup = await prisma.outputGroup.create({
      data: { name: group, runId },
      select: { id: true },
    });
    groupId = newGroup.id;
  }
  if (!keyId) {
    const newOutput = await prisma.output.create({
      data: { name: key, outputGroupId: groupId },
      select: { id: true },
    });
    keyId = newOutput.id;
  }

  return { groupId, keyId };
}

async function writeToDb(id, values) {
  const { values: currValues } = await prisma.output.findUniqueOrThrow({
    where: { id },
    select: { values: true },
  });
  await prisma.output.update({
    where: { id },
    data: { values: [...currValues, ...values] },
  });
}

export async function logData(req, res) {
  const { needIds } = req.body;
  if (needIds) {
    const {
      data: { group, key },
      runId,
    } = req.body;
    const ids = await findIds(runId, group.name, key.name);
    req.body.data.group.id = ids.groupId;
    req.body.data.key.id = ids.keyId;
    delete req.body.needIds;
    res.json(ids);
  } else {
    res.sendStatus(200);
  }

  sendToUserByLocation(req.user, req.body);
  writeToDb(req.body.data.key.id, req.body.data.values);
}

import { prisma } from 'src/db/prisma';
import { sendToUser } from 'src/server';

async function findIds(runId, group, key) {
  const result = await prisma.outputGroup.findUnique({
    where: { name_runId: { name: group, runId } },
    select: {
      id: true,
      children: { where: { name: key }, select: { id: true } },
    },
  });

  let groupId = result?.id;
  let keyId = result?.children[0].id;

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

  sendToUser(req.user, req.body);
}

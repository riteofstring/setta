import { prisma } from 'src/db/prisma';
import { sendToUser } from 'src/server';

async function findIds(runId, group, key) {
  const { outputGroups } = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    select: {
      outputGroups: {
        select: {
          id: true,
          name: true,
          children: { select: { id: true, name: true } },
        },
      },
    },
  });

  const matchingGroup = outputGroups.find((x) => x.name === group);
  let groupId = matchingGroup?.id;
  let keyId = matchingGroup?.children.find((x) => x.name === key)?.id;

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
    const ids = await findIds(runId, group, key);
    req.body.data.group = ids.groupId;
    req.body.data.key = ids.keyId;
    delete req.body.needIds;
    res.json(ids);
  } else {
    res.sendStatus(200);
  }

  sendToUser(req.user, req.body);
}

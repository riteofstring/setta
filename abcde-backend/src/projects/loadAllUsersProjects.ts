import * as _ from 'lodash';
import { prisma } from 'src/prisma';

async function loadAll(ownerId): Promise<any> {
  const ps = await prisma.project.findMany({
    where: { ownerId },
    include: { configs: true },
  });
  return _.keyBy(ps, 'id');
}

export async function loadAllUsersProjects(req, res) {
  const ownerId = req.user;
  if (!ownerId) {
    res.sendStatus(401);
    return;
  }
  const projects = await loadAll(ownerId);
  res.json(projects).status(200);
}

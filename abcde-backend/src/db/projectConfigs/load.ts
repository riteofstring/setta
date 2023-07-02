import { prisma } from 'src/db/prisma';

export async function getProjectConfig(id) {
  const p = await prisma.projectConfig.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      sections: {
        select: { childId: true },
      },
    },
  });

  const projectConfig = {
    id: p.id,
    name: p.name,
    children: p.sections.map((x) => x.childId),
  };

  return projectConfig;
}

export async function getPathnameFromProjectConfigId(id) {
  const info = await prisma.projectConfig.findFirstOrThrow({
    where: { id },
    select: {
      name: true,
      project: { select: { name: true, owner: { select: { name: true } } } },
    },
  });

  return `/${info.project.owner.name}/${info.project.name}/${info.name}`;
}

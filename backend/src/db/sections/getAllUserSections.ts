import { getDepthListing } from 'abcde-utils/src/childrenToDepth';
import { prisma } from '../prisma';
import { getSectionsRecursively } from './getSectionsRecurisvely';

export async function getAllUserSections(ownerId) {
  const projects = await prisma.project.findMany({
    where: { ownerId },
    include: {
      configs: {
        select: {
          id: true,
          name: true,
          sections: { select: { childId: true } },
        },
      },
    },
  });
  const output = [];
  for (const p of projects) {
    output.push({ id: p.id, name: p.name, selectable: false, depth: 0 });
    for (const c of p.configs) {
      output.push({ id: c.id, name: c.name, selectable: false, depth: 1 });
      const topLevelIds = c.sections.map((x) => x.childId);
      const sectionIds = await getSectionsRecursively(topLevelIds);
      const sections = await prisma.section.findMany({
        where: { id: { in: sectionIds } },
        include: {
          children: {
            select: { childId: true },
            orderBy: { order: 'asc' },
          },
        },
      });

      const { children, names } = createMappings(sections);
      const depthListing = getDepthListing(topLevelIds, children, names, 2);
      output.push(...depthListing);
    }
  }
  return output;
}

function createMappings(sections) {
  const children = {};
  const names = {};
  for (const s of sections) {
    children[s.id] = s.children.map((x) => x.childId);
    names[s.id] = s.name;
  }
  return { children, names };
}

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
      const sectionIds = await getSectionsRecursively(
        c.sections.map((x) => x.childId),
      );
      const sections = await prisma.section.findMany({
        where: { id: { in: sectionIds } },
      });
      for (const s of sections) {
        output.push({
          id: s.id,
          name: s.name,
          selectable: true,
          depth: 2,
        });
      }
    }
  }
  return output;
}

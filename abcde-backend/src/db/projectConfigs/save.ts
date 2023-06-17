import { ProjectConfigType } from 'abcde-utils/src/types/projectConfig';
import _ from 'lodash';
import { prisma } from 'src/db/prisma';
import { saveSectionChildren } from 'src/db/sections/save';

export async function saveProjectConfig(
  projectId: string,
  config: ProjectConfigType,
  sections,
) {
  const { children, ...theRest } = config;
  await prisma.projectConfig.upsert({
    where: { id: theRest.id },
    create: { ...theRest, projectId },
    update: { ...theRest, projectId },
  });

  const sectionPositions = _.mapValues(sections, (x) => x.initialPosition);
  await saveSectionChildren(
    { [theRest.id]: children },
    { [theRest.id]: sectionPositions },
    prisma.projectConfigChildren,
  );
}

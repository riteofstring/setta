import C from "constants/constants.json";
import { useActiveSection, useSectionInfos } from "state/definitions";
import {
  getProjectDataToGenerateCode,
  getProjectRuns,
  sendRunCodeMessage,
} from "./project/generateCode";
import { getSectionType } from "./sectionInfos";

export async function runCodeBlocks(sectionIds, withSweep = false) {
  const project = await getProjectDataToGenerateCode({});
  if (withSweep) {
    let count = 0;
    for (const projectVariant of getProjectRuns(project)) {
      await sendRunCodeMessage(projectVariant, count);
      count += 1;
    }
  } else {
    project.runCodeBlocks = sectionIds;
    await sendRunCodeMessage(project);
  }
}

export function runAllCode() {
  const codeBlocks = getCodeBlocks(false);
  if (codeBlocks.length > 0) {
    runCodeBlocks(codeBlocks);
  }
}

export function runActiveCode() {
  const codeBlocks = getCodeBlocks(true);
  if (codeBlocks.length > 0) {
    runCodeBlocks(codeBlocks);
  }
}

function getCodeBlocks(onlyActiveSections = false) {
  const codeBlocks = [];
  const ids = onlyActiveSections
    ? useActiveSection.getState().ids
    : Object.keys(useSectionInfos.getState().x);

  for (const id of ids) {
    if (getSectionType(id) !== C.CODE) {
      continue;
    }
    codeBlocks.push(id);
  }
  return codeBlocks;
}

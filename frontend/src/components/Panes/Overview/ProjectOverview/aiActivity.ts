import { getRunInputString } from "state/actions/agentRunUtils";
import {
  AgentRun,
  BaseSectionImplUnion,
  RunStatusEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function getActiveSectionIdsFromRuns(
  runs: Array<AgentRun>,
  projectConfigId: string | null = null,
): Set<string> {
  const activeSectionIds = new Set<string>();
  for (const run of runs) {
    if (run.status !== RunStatusEnum.running) {
      continue;
    }
    if (projectConfigId !== null) {
      const runProjectConfigId = getRunInputString(run, "projectConfigId");
      if (runProjectConfigId !== projectConfigId) {
        continue;
      }
    }
    const sectionId = getRunInputString(run, "sectionId");
    if (!sectionId) {
      continue;
    }
    activeSectionIds.add(sectionId);
  }
  return activeSectionIds;
}

export function isChatSectionWaitingForResponse(
  sectionImpl: BaseSectionImplUnion,
): boolean {
  if (sectionImpl.type !== SectionTypeEnum.Chat) {
    return false;
  }
  return Boolean(sectionImpl.waitingForResponse);
}

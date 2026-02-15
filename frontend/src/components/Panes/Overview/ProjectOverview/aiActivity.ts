import { getRunInputString } from "state/actions/agentRunUtils";
import {
  AgentRun,
  AgentRunStatusEnum,
  BaseSectionImplUnion,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function getActiveSectionIdsFromRuns(
  runs: Array<AgentRun>,
): Set<string> {
  const activeSectionIds = new Set<string>();
  for (const run of runs) {
    if (run.status !== AgentRunStatusEnum.running) {
      continue;
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

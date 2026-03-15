import { AgentRun, AgentRunStatusEnum } from "utils/generatedTypes";
import { getRunInputString, getRunLastUpdatedMs } from "./agentRunUtils";
import type {
  BuildChatHistoryEntriesOptions,
  ChatHistoryCompatibility,
  ChatRunProvenance,
  ChatRunSummary,
  ChatRunType,
} from "./chatHistoryTypes";

type ChatSummaryFilterOptions = {
  projectConfigId: string | null;
  sectionId: string | null;
  unscopedOnly: boolean;
  compatibility: ChatHistoryCompatibility | null;
};

export function collectChatRunSummaries(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions,
  includeBranchChats: boolean,
): Map<string, ChatRunSummary> {
  const sectionId = normalizeRunSectionId(options.sectionId ?? null);
  const projectConfigId = normalizeProjectConfigId(
    options.projectConfigId ?? null,
  );
  const unscopedOnly = options.unscopedOnly === true;
  const compatibility = options.compatibility ?? null;
  const branchChatIds = includeBranchChats
    ? new Set<string>()
    : collectBranchChatIds(runs, {
        projectConfigId,
        sectionId,
        unscopedOnly,
        compatibility,
      });
  const grouped = new Map<string, ChatRunSummary>();
  for (const run of runs) {
    if (
      !shouldCollectRunForChatSummary(run, {
        projectConfigId,
        sectionId,
        unscopedOnly,
        compatibility,
      })
    ) {
      continue;
    }
    const runChatId = getRunChatId(run);
    if (!runChatId || branchChatIds.has(runChatId)) {
      continue;
    }
    const lastUpdatedMs = getRunLastUpdatedMs(run);
    const waitingForResponse = run.status === AgentRunStatusEnum.running;
    const existing = grouped.get(runChatId);
    if (!existing || lastUpdatedMs >= existing.lastUpdatedMs) {
      grouped.set(runChatId, {
        latestRun: run,
        lastUpdatedMs,
        waitingForResponse,
      });
    }
  }
  return grouped;
}

export function shouldCollectRunForChatSummary(
  run: AgentRun,
  options: ChatSummaryFilterOptions,
): boolean {
  if (!isChatRun(run)) {
    return false;
  }
  if (!isRunCompatibleWithHistoryFilter(run, options.compatibility)) {
    return false;
  }
  if (
    options.projectConfigId !== null &&
    getRunInputString(run, "projectConfigId") !== options.projectConfigId
  ) {
    return false;
  }
  if (options.unscopedOnly && getRunSectionId(run) !== null) {
    return false;
  }
  if (options.sectionId && getRunSectionId(run) !== options.sectionId) {
    return false;
  }
  return true;
}

export function normalizeRunSectionId(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeProjectConfigId(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

export function getRunChatId(run: AgentRun): string | null {
  return getRunInputString(run, "chatId");
}

export function getRunType(run: AgentRun): ChatRunType | null {
  const runType = getRunInputString(run, "runType");
  if (
    runType === "llm_chat" ||
    runType === "external_agent" ||
    runType === "scriptable_chat"
  ) {
    return runType;
  }
  return null;
}

export function getRunEngineConfigId(run: AgentRun): string | null {
  return getRunInputString(run, "engineConfigId");
}

export function buildChatRunProvenance(
  run: AgentRun,
): ChatRunProvenance | null {
  const runType = getRunType(run);
  if (!runType) {
    return null;
  }
  return {
    runType,
    engineConfigId: getRunEngineConfigId(run),
  };
}

function collectBranchChatIds(
  runs: Array<AgentRun>,
  options: ChatSummaryFilterOptions,
): Set<string> {
  const branchChatIds = new Set<string>();
  for (const run of runs) {
    if (!shouldCollectRunForChatSummary(run, options) || !isBranchRun(run)) {
      continue;
    }
    const runChatId = getRunChatId(run);
    if (runChatId) {
      branchChatIds.add(runChatId);
    }
  }
  return branchChatIds;
}

function getRunSectionId(run: AgentRun): string | null {
  return getRunInputString(run, "sectionId");
}

function isChatRun(run: AgentRun): boolean {
  return getRunType(run) !== null;
}

function isRunCompatibleWithHistoryFilter(
  run: AgentRun,
  compatibility: ChatHistoryCompatibility | null,
): boolean {
  if (!compatibility) {
    return true;
  }
  const runType = getRunType(run);
  if (runType !== compatibility.runType) {
    return false;
  }
  if (!compatibility.engineConfigId) {
    return true;
  }
  return getRunEngineConfigId(run) === compatibility.engineConfigId;
}

function isBranchRun(run: AgentRun): boolean {
  return Boolean(getRunInputString(run, "branchParentChatId"));
}

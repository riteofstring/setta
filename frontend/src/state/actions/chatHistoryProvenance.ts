import { AgentRun } from "utils/generatedTypes";
import { getRunLastUpdatedMs } from "./agentRunUtils";
import {
  buildChatRunProvenance,
  collectChatRunSummaries,
  getRunChatId,
  normalizeProjectConfigId,
  normalizeRunSectionId,
  shouldCollectRunForChatSummary,
} from "./chatHistoryShared";
import type {
  BuildChatHistoryEntriesOptions,
  ChatRunProvenance,
  ScopedChatProvenanceLookupResult,
} from "./chatHistoryTypes";

export function buildChatProvenanceByChatId(
  runs: Array<AgentRun>,
  options: BuildChatHistoryEntriesOptions = {},
): Map<string, ChatRunProvenance> {
  const grouped = collectChatRunSummaries(runs, options, true);
  const provenance = new Map<string, ChatRunProvenance>();
  for (const [runChatId, summary] of grouped.entries()) {
    const runProvenance = buildChatRunProvenance(summary.latestRun);
    if (runProvenance) {
      provenance.set(runChatId, runProvenance);
    }
  }
  return provenance;
}

export function resolveScopedChatProvenanceForChatId(
  runs: Array<AgentRun>,
  {
    chatId,
    projectConfigId,
    sectionId,
    unscopedOnly,
  }: {
    chatId: string;
    projectConfigId?: string | null;
    sectionId?: string | null;
    unscopedOnly?: boolean;
  },
): ScopedChatProvenanceLookupResult {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) {
    return { status: "missing" };
  }
  const normalizedSectionId = normalizeRunSectionId(sectionId ?? null);
  const normalizedProjectConfigId = normalizeProjectConfigId(
    projectConfigId ?? null,
  );
  const candidates: Array<ChatRunProvenance & { lastUpdatedMs: number }> = [];
  for (const run of runs) {
    if (getRunChatId(run) !== normalizedChatId) {
      continue;
    }
    if (
      !shouldCollectRunForChatSummary(run, {
        projectConfigId: normalizedProjectConfigId,
        sectionId: normalizedSectionId,
        unscopedOnly: unscopedOnly === true,
        compatibility: null,
      })
    ) {
      continue;
    }
    const runProvenance = buildChatRunProvenance(run);
    if (!runProvenance) {
      continue;
    }
    candidates.push({
      ...runProvenance,
      lastUpdatedMs: getRunLastUpdatedMs(run),
    });
  }
  if (candidates.length === 0) {
    return { status: "missing" };
  }
  const latestUpdatedMs = Math.max(
    ...candidates.map((candidate) => candidate.lastUpdatedMs),
  );
  const latestCandidates = candidates.filter(
    (candidate) => candidate.lastUpdatedMs === latestUpdatedMs,
  );
  const distinctLatestProvenance = new Set(
    latestCandidates.map(
      (candidate) =>
        `${candidate.runType}:${candidate.engineConfigId ?? "__none__"}`,
    ),
  );
  if (distinctLatestProvenance.size > 1) {
    return { status: "ambiguous" };
  }
  const [latestCandidate] = latestCandidates;
  if (!latestCandidate) {
    return { status: "missing" };
  }
  return {
    status: "ready",
    provenance: {
      runType: latestCandidate.runType,
      engineConfigId: latestCandidate.engineConfigId,
    },
  };
}

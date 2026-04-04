import type { ProjectStateSingleConfig } from "utils/generatedTypes";

type RunCapabilityState = Pick<
  ProjectStateSingleConfig,
  "projectConfig" | "sectionCapabilities" | "singletonSections"
>;

type ResolvedRunRequest = {
  canRun: boolean;
  disabledReason: string | null;
  executionSectionId: string | null;
  effectiveSectionId: string | null;
};

const DEFAULT_RUN_DISABLED_REASON = "Run is unavailable.";
const MANUAL_ENTRY_REQUIRED_REASON = "Select a manual entry code block to run.";

export function resolveRunRequest(
  state: RunCapabilityState,
  requestedSectionId: string | null,
): ResolvedRunRequest {
  if (requestedSectionId !== null) {
    return resolveSectionRunRequest(state, requestedSectionId);
  }
  return resolveMainRunRequest(state);
}

export function resolveMainRunRequest(
  state: RunCapabilityState,
): ResolvedRunRequest {
  const effectiveSectionId = resolveEffectiveMainRunSectionId(state);
  if (!effectiveSectionId) {
    return {
      canRun: false,
      disabledReason: MANUAL_ENTRY_REQUIRED_REASON,
      executionSectionId: null,
      effectiveSectionId: null,
    };
  }

  const sectionCapabilities = state.sectionCapabilities[effectiveSectionId];
  if (!sectionCapabilities?.canRun) {
    return {
      canRun: false,
      disabledReason:
        sectionCapabilities?.runDisabledReason ?? DEFAULT_RUN_DISABLED_REASON,
      executionSectionId: null,
      effectiveSectionId,
    };
  }

  return {
    canRun: true,
    disabledReason: null,
    executionSectionId: sectionCapabilities.runRequestSectionId ?? null,
    effectiveSectionId,
  };
}

function resolveEffectiveMainRunSectionId(
  state: RunCapabilityState,
): string | null {
  const configuredEntrySectionId =
    state.projectConfig.entryCodeBlockId?.trim() ?? "";
  if (configuredEntrySectionId) {
    return configuredEntrySectionId;
  }

  if (!state.projectConfig.hasPythonCodegenTarget) {
    return null;
  }

  const generatedEntrySectionId = state.singletonSections.GenPythonCode?.trim();
  return generatedEntrySectionId ? generatedEntrySectionId : null;
}

function resolveSectionRunRequest(
  state: RunCapabilityState,
  sectionId: string,
): ResolvedRunRequest {
  const sectionCapabilities = state.sectionCapabilities[sectionId];
  if (!sectionCapabilities?.canRun) {
    return {
      canRun: false,
      disabledReason:
        sectionCapabilities?.runDisabledReason ?? DEFAULT_RUN_DISABLED_REASON,
      executionSectionId: null,
      effectiveSectionId: sectionId,
    };
  }

  return {
    canRun: true,
    disabledReason: null,
    executionSectionId: sectionCapabilities.runRequestSectionId ?? null,
    effectiveSectionId: sectionId,
  };
}

export function canSectionRun(
  state: RunCapabilityState,
  sectionId: string,
): boolean {
  return Boolean(state.sectionCapabilities[sectionId]?.canRun);
}

export function canSelectSectionAsEntryCodeBlock(
  state: RunCapabilityState,
  sectionId: string,
): boolean {
  return Boolean(
    state.sectionCapabilities[sectionId]?.canSelectAsEntryCodeBlock,
  );
}

export function getSectionEntryCodeBlockValue(
  state: RunCapabilityState,
  sectionId: string,
): string | null {
  return state.sectionCapabilities[sectionId]?.entryCodeBlockValue ?? null;
}

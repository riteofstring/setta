import type { SingleConfig } from "./generatedTypes";

type RunCapabilityState = Pick<
  SingleConfig,
  "projectConfig" | "sectionCapabilities" | "singletonSections"
>;

type RunnableRunRequest = {
  canRun: true;
  disabledReason: null;
  executionSectionId: string;
  effectiveSectionId: string;
};

type DisabledRunRequest = {
  canRun: false;
  disabledReason: string;
  executionSectionId: null;
  effectiveSectionId: string | null;
};

type ResolvedRunRequest = RunnableRunRequest | DisabledRunRequest;

function createRunnableRunRequest(
  effectiveSectionId: string,
  runRequestSectionId: string | null | undefined,
): RunnableRunRequest {
  const explicitExecutionSectionId = runRequestSectionId?.trim() ?? "";
  return {
    canRun: true,
    disabledReason: null,
    // Generated entry sections intentionally leave runRequestSectionId unset;
    // running them still requires sending the concrete section id.
    executionSectionId: explicitExecutionSectionId || effectiveSectionId,
    effectiveSectionId,
  };
}

function createDisabledRunRequest(
  disabledReason: string,
  effectiveSectionId: string | null,
): DisabledRunRequest {
  return {
    canRun: false,
    disabledReason,
    executionSectionId: null,
    effectiveSectionId,
  };
}

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
    return createDisabledRunRequest(MANUAL_ENTRY_REQUIRED_REASON, null);
  }

  const sectionCapabilities = state.sectionCapabilities[effectiveSectionId];
  if (!sectionCapabilities?.canRun) {
    return createDisabledRunRequest(
      sectionCapabilities?.runDisabledReason ?? DEFAULT_RUN_DISABLED_REASON,
      effectiveSectionId,
    );
  }

  return createRunnableRunRequest(
    effectiveSectionId,
    sectionCapabilities.runRequestSectionId,
  );
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
    return createDisabledRunRequest(
      sectionCapabilities?.runDisabledReason ?? DEFAULT_RUN_DISABLED_REASON,
      sectionId,
    );
  }

  return createRunnableRunRequest(
    sectionId,
    sectionCapabilities.runRequestSectionId,
  );
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

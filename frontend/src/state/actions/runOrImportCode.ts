import {
  useLocalStorage,
  useProjectState,
  useRunControl,
  useSettings,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_get_latest_project_state,
  route_interrupt_terminal_processes,
  route_run_code,
} from "utils/generatedEndpoints";
import {
  BinaryContentRef,
  type ProjectStateSingleConfigWithCompletedOpIds,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { resolveRunRequest } from "utils/runCapabilities";
import { collectDrawSnapshotPayloads } from "./drawSnapshots";
import { triggerListenerForceRefresh } from "./listeners";
import { addTemporaryNotification } from "./notifications";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  isBaseCodeSectionType,
  processProjectStateUpdateFromBackend,
} from "./sectionInfos";

type LatestProjectStateRouteResponse =
  ResponseDataAndStatus<ProjectStateSingleConfigWithCompletedOpIds>;
type RunCodeRouteResponse = ResponseDataAndStatus<null>;

export async function runCodeBlock(sectionId: string | null) {
  const state = useProjectState.getState();
  const { projectConfig } = state;
  const runRequest = resolveRunRequest(state, sectionId);
  if (!runRequest.canRun) {
    addTemporaryNotification(
      runRequest.disabledReason ?? "Run is unavailable.",
    );
    return;
  }
  const executionSectionId = runRequest.executionSectionId;
  const shareSession = useShareSession.getState();
  let runSnapshotMode = null;
  if (!shareSession.isDeploymentMode) {
    const overrides =
      useLocalStorage.getState().runSnapshotModeByProjectConfigId;
    const runSnapshotOverride = overrides[projectConfig.id];
    if (runSnapshotOverride !== undefined) {
      runSnapshotMode = runSnapshotOverride;
    } else {
      runSnapshotMode = useSettings.getState().backend.runSnapshotMode;
    }
  }
  const terminalSectionId =
    await ensureAttachedTerminalForRun(executionSectionId);
  const shouldRefreshProjectState =
    terminalSectionId === null &&
    shouldRefreshProjectStateAfterRun(executionSectionId);
  const drawSnapshotsBySectionId = await collectDrawSnapshotsForRun();
  const runResponse: RunCodeRouteResponse = await route_run_code({
    projectConfigId: projectConfig.id,
    sectionId: executionSectionId,
    terminalSectionId,
    cliId: null,
    runSnapshotMode,
    drawSnapshotsBySectionId,
  });
  if (!shouldRefreshProjectState || !res200(runResponse)) {
    return;
  }

  const latestProjectStateResponse: LatestProjectStateRouteResponse =
    await route_get_latest_project_state({
      projectConfigId: projectConfig.id,
    });
  if (!res200(latestProjectStateResponse)) {
    return;
  }
  processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

export async function runFromMainRunButton(): Promise<void> {
  const { runMode, continuousRunStarted } = useRunControl.getState();
  if (runMode === "continuous") {
    if (continuousRunStarted) {
      useRunControl.setState({
        continuousRunStarted: false,
        continuousRunCustomRunId: null,
      });
      return;
    }

    useRunControl.setState({
      continuousRunStarted: true,
      continuousRunCustomRunId: null,
    });
    await triggerListenerForceRefresh();
    return;
  }

  useRunControl.setState({
    continuousRunStarted: false,
    continuousRunCustomRunId: null,
  });
  await runEntryCodeBlock();
}

export async function stopCode() {
  addTemporaryNotification("Stopping subprocesses");
  route_interrupt_terminal_processes({
    projectId: getCurrProjectConfigId(),
  });
}

async function collectDrawSnapshotsForRun(): Promise<Record<
  string,
  BinaryContentRef
> | null> {
  const state = useProjectState.getState();
  const sectionIds = Object.keys(state.projectConfig.sectionVariantMap);
  const drawSectionIds = sectionIds.filter(
    (sectionId) =>
      getCurrEffectiveSectionImpl(state, sectionId).type ===
      SectionTypeEnum.Draw,
  );
  if (drawSectionIds.length === 0) {
    return null;
  }
  return await collectDrawSnapshotPayloads(drawSectionIds);
}

async function ensureAttachedTerminalForRun(
  sectionId: string | null,
): Promise<string | null> {
  if (!sectionId) {
    return null;
  }
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseCodeSectionType(impl.type)) {
    return null;
  }
  const existingTerminalId = resolveAttachedTerminalId(state, sectionId);
  if (existingTerminalId) {
    return existingTerminalId;
  }
  return null;
}

function shouldRefreshProjectStateAfterRun(
  executionSectionId: string | null,
): boolean {
  if (executionSectionId === null) {
    return true;
  }
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, executionSectionId);
  return isBaseCodeSectionType(impl.type);
}

function resolveAttachedTerminalId(
  state: ZustandProjectState,
  sectionId: string,
): string | null {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseCodeSectionType(impl.type)) {
    return null;
  }
  if (!impl.attachedTerminalSectionId) {
    return null;
  }
  const terminalId = impl.attachedTerminalSectionId;
  if (!(terminalId in state.sections)) {
    return null;
  }
  const terminalImpl = getCurrEffectiveSectionImpl(state, terminalId);
  if (terminalImpl.type !== SectionTypeEnum.Terminal) {
    return null;
  }
  return terminalId;
}

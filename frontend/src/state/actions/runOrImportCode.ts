import {
  useLocalStorage,
  useProjectState,
  useRunControl,
  useSettings,
  useShareSession,
} from "state/definitions";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import {
  route_kill_subprocesses,
  route_run_code,
} from "utils/generatedEndpoints";
import { triggerListenerForceRefresh } from "./listeners";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfig, singletonSections } = useProjectState.getState();
  const pythonCodegenEnabled = projectConfigHasPythonCodegen(projectConfig);
  if (pythonCodegenEnabled && sectionId === singletonSections.GenPythonCode) {
    sectionId = null;
  }
  const shareSession = useShareSession.getState();
  let runSnapshotMode = null;
  if (!shareSession.isShareMode) {
    const overrides =
      useLocalStorage.getState().runSnapshotModeByProjectConfigId;
    const runSnapshotOverride = overrides[projectConfig.id];
    if (runSnapshotOverride !== undefined) {
      runSnapshotMode = runSnapshotOverride;
    } else {
      runSnapshotMode = useSettings.getState().backend.runSnapshotMode;
    }
  }
  await route_run_code({
    projectConfigId: projectConfig.id,
    sectionId,
    cliId: null,
    runSnapshotMode,
  });
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
  route_kill_subprocesses({
    projectConfigId: getCurrProjectConfigId(),
  });
}

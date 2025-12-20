import { useProjectState, useRunControl } from "state/definitions";
import {
  route_kill_subprocesses,
  route_run_code,
} from "utils/generatedEndpoints";
import { triggerListenerForceRefresh } from "./listeners";
import { addTemporaryNotification } from "./notifications";
import { getCurrProjectConfigId } from "./sectionInfos";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfig, singletonSections } = useProjectState.getState();
  if (sectionId === singletonSections.GenPythonCode) {
    sectionId = null;
  }
  await route_run_code({
    projectConfigId: projectConfig.id,
    sectionId,
    cliId: null,
  });
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

export async function runFromMainRunButton(): Promise<void> {
  const { runMode, continuousRunStarted } = useRunControl.getState();
  if (runMode === "continuous") {
    if (continuousRunStarted) {
      useRunControl.setState({ continuousRunStarted: false });
      return;
    }

    useRunControl.setState({ continuousRunStarted: true });
    await triggerListenerForceRefresh();
    return;
  }

  useRunControl.setState({ continuousRunStarted: false });
  await runEntryCodeBlock();
}

export async function stopCode() {
  addTemporaryNotification("Stopping subprocesses");
  route_kill_subprocesses({
    projectConfigId: getCurrProjectConfigId(),
  });
}

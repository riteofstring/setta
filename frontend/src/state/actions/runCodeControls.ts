import { useRunControl } from "state/stores/projectStatusStores";
import { route_kill_subprocesses } from "utils/generatedEndpoints";
import { triggerListenerForceRefresh } from "./listeners";
import { addTemporaryNotification } from "./notifications";
import { runEntryCodeBlock } from "./runCodeExecution";
import { getCurrProjectConfigId } from "./sectionInfos";

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

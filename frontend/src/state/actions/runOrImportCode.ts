import { useProjectState } from "state/definitions";
import {
  route_kill_subprocesses,
  route_run_code,
} from "utils/generatedEndpoints";
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

export async function stopCode() {
  addTemporaryNotification("Stopping subprocesses");
  route_kill_subprocesses({
    projectConfigId: getCurrProjectConfigId(),
  });
}

import { useProjectState } from "state/definitions";
import { route_run_code } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";
import { sectionIsOfType } from "./sectionInfos";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfig } = useProjectState.getState();
  if (sectionId && sectionIsOfType(sectionId, SectionTypeEnum.GenPythonCode)) {
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

import { dbRunCode } from "requests/terminals";
import { useProjectState } from "state/definitions";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfig } = useProjectState.getState();
  await dbRunCode(projectConfig.id, sectionId);
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

import { dbRunCode } from "requests/terminals";
import { useProjectState } from "state/definitions";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfigId } = useProjectState.getState();
  await dbRunCode(projectConfigId, sectionId);
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

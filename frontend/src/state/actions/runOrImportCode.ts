import { dbRunCode } from "requests/terminals";
import { useProjectState } from "state/definitions";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";

export async function runCodeBlock(sectionId: string | null) {
  const { projectConfigId } = useProjectState.getState();
  const res = await dbRunCode(projectConfigId, sectionId);
  if (res.status === 200) {
    const { terminalId, newTerminalCreated } = res.data;
    if (newTerminalCreated) {
      createTemporaryTerminalFromBackend(terminalId);
    }
  }
}

export async function runEntryCodeBlock() {
  await runCodeBlock(null);
}

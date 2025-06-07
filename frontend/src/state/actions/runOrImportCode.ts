import { dbRunCode } from "requests/terminals";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { getProjectDataToGenerateCode } from "./project/generateCode";
import { getCurrentProjectConfig } from "./project/loadProject";

export async function runCodeBlock(sectionId: string | null) {
  const project = await getProjectDataToGenerateCode({});
  const res = await dbRunCode(project, sectionId);
  if (res.status === 200) {
    const { terminalId, newTerminalCreated } = res.data;
    console.log(res.data);
    if (newTerminalCreated) {
      createTemporaryTerminalFromBackend(terminalId);
    }
    return terminalId;
  }
}

export async function runEntryCodeBlock() {
  // ids should be length 0 or 1
  const id = getCurrentProjectConfig().entryCodeBlockId;
  const terminalId = await runCodeBlock(id);
  return terminalId;
}

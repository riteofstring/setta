import C from "constants/constants.json";
import { dbRunCode } from "requests/terminals";
import { useSectionInfos } from "state/definitions";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { getProjectDataToGenerateCode } from "./project/generateCode";
import { getSectionType } from "./sectionInfos";

export async function runCodeBlock(sectionId) {
  const project = await getProjectDataToGenerateCode({});
  project.entryCodeBlock = sectionId;
  const res = await dbRunCode(project);
  if (res.status == 200) {
    const { terminalId, newTerminalCreated } = res.data;
    if (newTerminalCreated) {
      createTemporaryTerminalFromBackend(terminalId);
    }
    return terminalId;
  }
}

/**
 * Runs the main entry code block.
 * @SETTA_MCP_TOOL
 * @returns {ID} the id of the terminal running the code
 */
export async function runEntryCodeBlock() {
  // ids should be length 0 or 1
  const id = getEntryCodeBlock();
  const terminalId = await runCodeBlock(id);
  return terminalId;
}

function getEntryCodeBlock() {
  const state = useSectionInfos.getState();
  for (const s of Object.values(state.x)) {
    if (getSectionType(s.id) === C.CODE && s.isEntryCodeBlock) {
      return s.id;
    }
  }
  return null;
}

import C from "constants/constants.json";
import { dbRunCode } from "requests/terminals";
import { useProjectState } from "state/definitions";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { getProjectDataToGenerateCode } from "./project/generateCode";
import { getSectionType } from "./sectionInfos";

export async function runCodeBlock(sectionId) {
  const project = await getProjectDataToGenerateCode({});
  const res = await dbRunCode(project, sectionId);
  if (res.status == 200) {
    const { terminalId, newTerminalCreated } = res.data;
    console.log(res.data)
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
  const state = useProjectState.getState();
  for (const s of Object.values(state.sections)) {
    if (getSectionType(s.id) === C.CODE && s.isEntryCodeBlock) {
      return s.id;
    }
  }
  return null;
}

import C from "constants/constants.json";
import { dbRunCode } from "requests/terminals";
import { useActiveSection, useSectionInfos } from "state/definitions";
import { createTemporaryTerminalFromBackend } from "state/hooks/terminals/terminal";
import { getProjectDataToGenerateCode } from "./project/generateCode";
import { getSectionType } from "./sectionInfos";

export async function runCodeBlocks(sectionIds) {
  const project = await getProjectDataToGenerateCode({});
  project.runCodeBlocks = sectionIds;
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
  const ids = getEntryCodeBlock();
  const terminalId = await runCodeBlocks(ids);
  return terminalId;
}

function getEntryCodeBlock() {
  const ids = [];
  const state = useSectionInfos.getState();
  for (const s of Object.values(state.x)) {
    if (getSectionType(s.id) === C.CODE && s.isEntryCodeBlock) {
      ids.push(s.id);
    }
  }
  return ids;
}

export function runActiveCode() {
  const codeBlocks = getCodeBlocks(true);
  if (codeBlocks.length > 0) {
    runCodeBlocks(codeBlocks);
  }
}

function getCodeBlocks(onlyActiveSections = false) {
  const codeBlocks = [];
  const ids = onlyActiveSections
    ? useActiveSection.getState().ids
    : Object.keys(useSectionInfos.getState().x);

  for (const id of ids) {
    if (getSectionType(id) !== C.CODE) {
      continue;
    }
    codeBlocks.push(id);
  }
  return codeBlocks;
}

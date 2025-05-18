// GENERATED FILE - DO NOT EDIT MANUALLY
// Generated automatically
import C from "constants/constants.json";
import { sendMessage } from "requests/websocket";

import { setGenCodePrefix } from "../components/Panes/UiEditor/SectionConfig/GenPythonCodeSettings";
import { setParamValuesMcp } from "../components/Params/ParamItems/ParamInput";
import { getPaneRectMcp } from "../forks/xyflow/core/utils/graphMcp";
import {
  deleteTextRange,
  getCurrentCode,
  startStreamingInto,
  stopStreamingInto,
} from "./actions/ai";
import { addParametersMcp } from "./actions/kwargs";
import { updateNodePositionsMcp } from "./actions/nodeInternals";
import { runEntryCodeBlock } from "./actions/runOrImportCode";
import { addSectionsAtPositionMcp } from "./actions/sections/createSections";
import {
  groupSections,
  ungroupGroupMcp,
} from "./actions/sections/groupSections";
import {
  getAllSectionInformationMcp,
  getSectionCurrentCodeInfoMcp,
} from "./actions/sections/sectionContents";
import { setSelectedItemMcp } from "./actions/sections/setSelectedItem";

// Registry of all MCP tools
const mcpToolRegistry = {
  setGenCodePrefix,
  setParamValuesMcp,
  getPaneRectMcp,
  startStreamingInto,
  stopStreamingInto,
  deleteTextRange,
  getCurrentCode,
  addParametersMcp,
  updateNodePositionsMcp,
  runEntryCodeBlock,
  addSectionsAtPositionMcp,
  groupSections,
  ungroupGroupMcp,
  getSectionCurrentCodeInfoMcp,
  getAllSectionInformationMcp,
  setSelectedItemMcp,
};

export async function mcpToolUse(details) {
  const { fnName, args = {}, id } = details;
  let result;

  try {
    // Check if the function exists in our registry
    if (fnName in mcpToolRegistry) {
      // Call the function with the provided arguments
      result = await mcpToolRegistry[fnName](args);
    } else {
      throw new Error(`Unknown MCP tool function: ${fnName}`);
    }
  } catch (error) {
    console.error(`Error executing MCP tool ${fnName}:`, error);
    result = { [C.SETTA_MCP_TOOL_ERROR]: error.message };
  }

  if (result === undefined) {
    result = null;
  }

  // Send the result back to the backend
  sendMessage({
    id,
    content: result,
    messageType: C.WS_MCP_TOOL_USE_RETURN,
  });
}

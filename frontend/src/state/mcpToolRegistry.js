// GENERATED FILE - DO NOT EDIT MANUALLY
// Generated on 2025-04-11T01:11:16.269Z
import C from "constants/constants.json";
import { sendMessage } from "requests/websocket";

import {
  addGroupInEmptySpace,
  addRegularSectionInEmptySpace,
  addTerminalInEmptySpace,
} from "./actions/sections/createSections";

// Registry of all MCP tools
const mcpToolRegistry = {
  addRegularSectionInEmptySpace,
  addGroupInEmptySpace,
  addTerminalInEmptySpace,
};

export function mcpToolUse(details) {
  const { fnName, args = {}, id } = details;
  let result;

  try {
    // Check if the function exists in our registry
    if (fnName in mcpToolRegistry) {
      // Call the function with the provided arguments
      result = mcpToolRegistry[fnName](...Object.values(args));
    } else {
      throw new Error(`Unknown MCP tool function: ${fnName}`);
    }
  } catch (error) {
    console.error(`Error executing MCP tool ${fnName}:`, error);
    result = { error: error.message };
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

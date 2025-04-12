import C from "constants/constants.json";
import { sendMessage } from "requests/websocket";
import { addRegularSectionInEmptySpace } from "./sections/createSections";

export function mcpToolUse(details) {
  const { fnName, args, id } = details;
  let result;

  if (fnName === "addRegularSectionInEmptySpace") {
    addRegularSectionInEmptySpace();
    result = "success!"
  }

  sendMessage({
    id,
    content: result,
    messageType: C.WS_MCP_TOOL_USE_RETURN,
  });
}

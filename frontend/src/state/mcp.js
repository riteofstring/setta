import { useReactFlow } from "forks/xyflow/core/store";
import { getPaneRect } from "forks/xyflow/core/utils/graph";
import { useLocalStorage } from "state/definitions";
import { cancelableSetParamEnteredValue } from "./actions/sectionInfos";

/**
 * Set the values of multiple parameters in a particular section.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section that contains the parameters.
 * @param {Object<ID, string>} paramIdsToValues A mapping from parameter id to value. Each value is a string that contains python code that evaluates to whatever you want the parameter's value to be. For example to set the parameter to True, pass in "True". To set the parameter to "dog", pass in '"dog"'.
 * @return {Object<ID, boolean>} a map from parameter id to whether or not the value was successfully set.
 */
export async function setParamValuesMcp({ sectionId, paramIdsToValues }) {
  const status = {};
  for (const [paramInfoId, vStr] of Object.entries(paramIdsToValues)) {
    try {
      await cancelableSetParamEnteredValue({ sectionId, paramInfoId, vStr });
      status[paramInfoId] = true;
    } catch {
      status[paramInfoId] = false;
    }
  }
  return status;
}

/**
 * Gets the position and dimensions of the area of the zoomable/pannable pane that is currently being viewed.
 * @SETTA_MCP_TOOL
 * @return {ReactFlowPaneRect} x, y, height, width.
 */
export function getPaneRectMcp() {
  return getPaneRect(
    useReactFlow.getState(),
    useLocalStorage.getState().overviewTrueWidth,
  );
}

/**
 * Start streaming text into a specific code block. You can think of a code block like a source code file. After you call this tool, everything you respond with will be redirected and written to this code block. For example, if you start writing Python code, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context, but not in a python code context. If you want to replace code, use the deleteCodeRange tool first. Then use insertAtLine to specify the line number where new code should appear.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to start writing code into.
 * @param {integer} [insertAtLine] Optional line number (1-indexed) to insert at. If omitted, appends to the end.
 */
export function startStreamingInto({ sectionId, insertAtLine, chatId }) {
  // Get the current code
  const currCode = getCurrentCode({ sectionId });
  const lines = currCode.split("\n");
  const totalLines = lines.length;

  // Initialize streaming state
  let beforeLines = "";
  let afterLines = "";

  // Handle insertAtLine if specified
  if (!_.isNil(insertAtLine)) {
    // Convert to 0-indexed for array operations
    const insertIndex = insertAtLine - 1;

    // Validate insertion point
    if (insertAtLine < 1 || (totalLines > 0 && insertAtLine > totalLines + 1)) {
      throw new Error(
        `Invalid insertAtLine: ${insertAtLine}. Valid range is 1 to ${totalLines + 1}.`,
      );
    }

    // Split the code at the insertion point
    beforeLines = lines.slice(0, insertIndex).join("\n");
    afterLines = lines.slice(insertIndex).join("\n");
  } else {
    // If no insertion point, append to the end
    beforeLines = currCode;
    afterLines = "";
  }

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: {
            sectionId,
            before: beforeLines,
            after: afterLines,
            contentToInsert: "",
          },
        },
      },
    };
  });
}

/**
 * Stop streaming text into the code block.
 * @SETTA_MCP_TOOL
 * @returns {string} the code with all the changes applied.
 */
export function stopStreamingInto({ chatId }) {
  const { chatDetails } = useAIStore.getState();
  const chatStreamTarget = chatDetails[chatId]?.streamTarget;
  if (!chatStreamTarget) {
    return "";
  }
  const { sectionId } = chatStreamTarget;
  const code = getSectionVariant(sectionId).code;

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: null,
        },
      },
    };
  });

  return code;
}

/**
 * Delete a range of code from a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the code with the specified range deleted.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
export function deleteCodeRange({ sectionId, startLine, endLine }) {
  // Update the state
  let updatedCode;
  useSectionInfos.setState((x) => {
    const sectionVariant = getSectionVariant(sectionId, x);
    if (_.isNil(startLine) && _.isNil(endLine)) {
      updatedCode = "";
    } else {
      const lines = sectionVariant.code.split("\n");
      const totalLines = lines.length;
      const [start, end] = convertAndValidateLineNumbers(
        startLine,
        endLine,
        totalLines,
      );

      // Delete the specified range by keeping everything before start and after end
      const updatedLines = [...lines.slice(0, start), ...lines.slice(end)];

      // Join the lines back together
      updatedCode = updatedLines.join("\n");
    }
    sectionVariant.code = updatedCode;
  });

  return updatedCode;
}

/**
 * Get the current code that's in a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to retrieve code from.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the requested code from the code block.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
export function getCurrentCode({ sectionId, startLine, endLine }) {
  const code = getSectionVariant(sectionId).code;

  // If no line parameters are provided, return the entire code
  if (_.isNil(startLine) && _.isNil(endLine)) {
    return code;
  }

  const lines = code.split("\n");
  const [start, end] = convertAndValidateLineNumbers(
    startLine,
    endLine,
    lines.length,
  );

  // Extract and return the requested lines
  return lines.slice(start, end).join("\n");
}

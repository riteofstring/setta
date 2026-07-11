import { join } from "node:path";

import { captureScreenshot, waitForState } from "./electron-cdp-harness.mjs";
import {
  easyButtonStateExpression,
  easyButtonStateSettled,
  submitEasyButtonRequest,
  workflowTimeoutMs,
} from "./easy-button-pane-actions.mjs";
import { assertLosslessSteeringChatRecord } from "./easy-button-chat-record-assertions.mjs";
import { assertStaleCurrentFocus } from "./easy-button-focus-assertions.mjs";

const requestText = "easy run narrator failure workflow";
const steeringText = "Keep the accepted work running despite stale narration.";
const outcomeMessage = "Instruction sent, but Current focus could not be updated.";

export async function exerciseSteeringPartialOutcome(client, artifactDir) {
  await submitEasyButtonRequest(client, steeringText);
  const state = await waitForState(
    client,
    easyButtonStateExpression(),
    (candidate) =>
      easyButtonStateSettled(candidate, "working") &&
      candidate.focusStatus === "stale" &&
      candidate.errorText === outcomeMessage &&
      candidate.inputValue === "" &&
      candidate.stopButtonVisible &&
      !candidate.stopButtonDisabled,
    workflowTimeoutMs,
  );
  assertStaleCurrentFocus(state, requestText);
  assertStateFields(state, {
    easyState: "working",
    errorText: outcomeMessage,
    inputFocused: false,
    inputValue: "",
    stopButtonDisabled: false,
    stopButtonVisible: true,
  });
  const chatRecord = await client.driver("easyButtonPaneChatRecord");
  assertLosslessSteeringChatRecord(chatRecord, requestText, steeringText);
  await captureScreenshot(client, join(artifactDir, "easy-button-steering-partial-outcome.png"));
  return state;
}

function assertStateFields(state, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(
        `easy-button accepted steering partial outcome looked rejected: ${JSON.stringify(state)}`,
      );
    }
  }
}

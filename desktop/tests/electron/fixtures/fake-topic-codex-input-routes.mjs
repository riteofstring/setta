export function createExactStructuredInputRoutes({ simultaneousCompletionInput }) {
  const sideConversationInputs = new Set([
    "hold close while side creation is pending",
    "hold restart side",
    "side lifecycle answer",
    "side provider failure",
  ]);
  const steeringInputs = new Set([
    simultaneousCompletionInput,
    "finish the parent after side work",
    "steer alpha now",
  ]);
  const folderlessNarratorInputs = new Set([
    "hi",
    "Start the Gamma topic from the global master.",
    "what folder am I in?",
    "what can you help with?",
  ]);
  const folderRequiredInputs = new Set(["Inspect the repository files."]);
  return [
    { inputs: new Set(["What is the primary agent doing?"]), kind: "answer_as_narrator" },
    { inputs: folderlessNarratorInputs, kind: "answer_as_narrator" },
    { inputs: folderRequiredInputs, kind: "send_to_parent" },
    { inputs: sideConversationInputs, kind: "create_side_conversation" },
    { inputs: new Set(["Alpha topic fork"]), kind: "fork_conversation" },
    { inputs: steeringInputs, kind: "steer_parent_turn" },
  ];
}

import { nonEmptyString } from "./fake-topic-codex-app-server-helpers.mjs";

const directorToolNames = [
  "create_workstream",
  "list_workspaces",
  "list_workstreams",
  "recover_run",
  "select_workstream",
  "steer_work",
  "submit_work",
];

const selectedWorkScenarios = new Map([
  ["Director send hold.", { input: "director hold", tool: "submit_work" }],
  ["Director queue next.", { input: "director queued", tool: "submit_work" }],
  ["Director steer now.", { input: "finish director hold", tool: "steer_work" }],
  ["Director send cancel hold.", { input: "director hold cancel", tool: "submit_work" }],
  ["Director request approval.", { input: "director approval", tool: "submit_work" }],
  ["Director fail.", { input: "director fail", tool: "submit_work" }],
  ["Director artifact.", { input: "director artifact", tool: "submit_work" }],
  ["Director graph burst.", { input: "director graph burst", tool: "submit_work" }],
  [
    "Director text burst.",
    {
      input: "Profile exactly 2000 conversation events for workstream 1.",
      tool: "submit_work",
    },
  ],
  ["Director sustained.", { input: "director sustained profile", tool: "submit_work" }],
]);

export function threadHasDirectorTools(thread) {
  const namespace = (thread?.dynamicTools ?? []).find(
    (tool) => tool?.type === "namespace" && tool.name === "setta" && Array.isArray(tool.tools),
  );
  if (!namespace) {
    return false;
  }
  const names = namespace.tools
    .filter((tool) => tool?.type === "function")
    .map((tool) => tool.name)
    .sort();
  if (names.join("\n") !== directorToolNames.join("\n")) {
    return false;
  }
  const valid = [
    thread.approvalPolicy === "never",
    thread.sandbox === "read-only",
    thread.ephemeral === true,
    nonEmptyString(namespace.description),
    thread.developerInstructions?.includes("one long-running conversation"),
    thread.developerInstructions?.includes("`setta` tool namespace"),
  ].every(Boolean);
  if (!valid) {
    throw new Error("Director provider thread policy or instructions drifted");
  }
  return true;
}

export function directorScenarioForTurn(text, injectedItems = []) {
  if (text.startsWith("local transcript for ")) {
    return scenario([], "The Director received the voice request.");
  }
  if (text === "Director normal conversation.") {
    return scenario([], "The Director can answer without acting.");
  }
  if (text === "Remember DIRECTOR_HISTORY_OK and acknowledge it.") {
    return scenario([], "I will remember DIRECTOR_HISTORY_OK.");
  }
  if (text === "What marker did I ask you to remember?") {
    const history = JSON.stringify(injectedItems);
    return history.includes("Remember DIRECTOR_HISTORY_OK") &&
      history.includes("I will remember DIRECTOR_HISTORY_OK.")
      ? scenario([], "DIRECTOR_HISTORY_OK")
      : null;
  }
  if (text === "Director create workspace workstream.") {
    return scenario(["list_workspaces", "create_workspace"], "Created and selected Director root.");
  }
  if (text === "Director create folderless.") {
    return scenario(["create_folderless"], "Created the folderless Director root.");
  }
  if (text === "Director recover.") {
    return scenario(["list_workstreams", "recover_run"], "Recovered the failed Director run.");
  }
  const selectedWork = selectedWorkScenarios.get(text);
  if (selectedWork) {
    return scenario(
      ["list_workstreams", { kind: "selected_work", ...selectedWork }],
      `Completed ${selectedWork.tool}.`,
    );
  }
  return null;
}

function scenario(steps, reply) {
  return { reply, steps };
}

export function directorToolCallForStep(scenarioValue, index, receipts) {
  const step = scenarioValue?.steps?.[index];
  if (step === undefined) {
    return null;
  }
  if (step === "list_workspaces" || step === "list_workstreams") {
    return { arguments: {}, tool: step };
  }
  if (step === "create_workspace") {
    return {
      arguments: {
        initialInput: null,
        title: "Director root",
        workspaceId: requiredWorkspace(receipts).workspaceId,
      },
      tool: "create_workstream",
    };
  }
  if (step === "create_folderless") {
    return {
      arguments: {
        initialInput: "director folderless first work",
        title: "Director root",
        workspaceId: null,
      },
      tool: "create_workstream",
    };
  }
  if (step === "recover_run") {
    const workstream = requiredSelectedWorkstream(receipts);
    const failure = workstream.recoverableFailures?.[0];
    if (!nonEmptyString(failure?.failureEventId)) {
      throw new Error("Director recover_run scenario received no recoverable failure");
    }
    return {
      arguments: {
        failureEventId: failure.failureEventId,
        workstreamId: workstream.workstreamId,
      },
      tool: "recover_run",
    };
  }
  if (step?.kind === "selected_work") {
    const workstream = requiredSelectedWorkstream(receipts);
    return {
      arguments: {
        input: step.input,
        workstreamId: workstream.workstreamId,
      },
      tool: step.tool,
    };
  }
  throw new Error(`unsupported Director tool scenario step ${JSON.stringify(step)}`);
}

export function decodeDirectorToolReceipt(requestId, expectedTool, message) {
  if (message.error) {
    throw new Error(`Director tool ${requestId} failed: ${message.error.message}`);
  }
  const result = message.result;
  const item = Array.isArray(result?.contentItems) ? result.contentItems[0] : null;
  if (
    result?.success !== true ||
    result.contentItems.length !== 1 ||
    item?.type !== "inputText" ||
    !nonEmptyString(item.text)
  ) {
    throw new Error(`Director tool ${requestId} returned a malformed result`);
  }
  const receipt = JSON.parse(item.text);
  if (
    receipt?.tool !== expectedTool ||
    !nonEmptyString(receipt.summary) ||
    receipt.summary.startsWith("Setta refused") ||
    receipt.summary.startsWith("Setta could not")
  ) {
    throw new Error(`Director tool ${requestId} receipt drifted: ${JSON.stringify(receipt)}`);
  }
  validateDirectorToolReceipt(expectedTool, receipt);
  return receipt;
}

function validateDirectorToolReceipt(tool, receipt) {
  switch (tool) {
    case "list_workspaces":
      if (!Array.isArray(receipt.workspaces) || receipt.workspaces.length === 0) {
        throw new Error("Director list_workspaces returned no authorized workspace");
      }
      return;
    case "list_workstreams":
      if (!Array.isArray(receipt.workstreams) || receipt.workstreams.length === 0) {
        throw new Error("Director list_workstreams returned no workstream");
      }
      return;
    case "create_workstream":
      if (
        !nonEmptyString(receipt.workstreamId) ||
        receipt.selectedWorkstreamId !== receipt.workstreamId
      ) {
        throw new Error("Director create_workstream did not create and select one workstream");
      }
      return;
    case "recover_run":
    case "steer_work":
    case "submit_work":
      if (!nonEmptyString(receipt.workstreamId)) {
        throw new Error(`Director ${tool} receipt names no workstream`);
      }
      return;
    default:
      throw new Error(`unexpected Director tool receipt ${tool}`);
  }
}

function requiredWorkspace(receipts) {
  const workspaces = receipts.find((receipt) => Array.isArray(receipt.workspaces))?.workspaces;
  const workspace = workspaces?.[0];
  if (!nonEmptyString(workspace?.workspaceId)) {
    throw new Error("Director scenario received no authorized workspace");
  }
  return workspace;
}

function requiredSelectedWorkstream(receipts) {
  const listing = [...receipts].reverse().find((receipt) => Array.isArray(receipt.workstreams));
  const selected =
    listing?.workstreams?.find((workstream) => workstream.selected === true) ??
    listing?.workstreams?.find(
      (workstream) => workstream.workstreamId === listing.selectedWorkstreamId,
    );
  if (!nonEmptyString(selected?.workstreamId)) {
    throw new Error("Director scenario received no selected workstream");
  }
  if (!Array.isArray(selected.recoverableFailures)) {
    throw new Error("Director workstream summary omitted recoverable failures");
  }
  return selected;
}

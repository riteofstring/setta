import { nonEmptyString } from "./fake-topic-codex-app-server-helpers.mjs";

const directorToolNames = [
  "archive_workstream",
  "cancel_run",
  "create_workstream",
  "list_workspaces",
  "list_workstreams",
  "read_activity",
  "recover_run",
  "rename_workstream",
  "resolve_approval",
  "resolve_resource_request",
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
  [
    "Director request command approval.",
    { input: "director command approval", tool: "submit_work" },
  ],
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
  if (text === "Director cancel.") {
    return scenario(
      ["list_workstreams", "cancel_selected", "list_workstreams", { kind: "finish_if_cancelled" }],
      "Cancelled the selected Director run.",
    );
  }
  if (text === "Director try secret approval.") {
    return scenario(
      ["read_activity", { kind: "resolve_approval", secret: true, succeeds: false }],
      "The secret approval is waiting for the user.",
    );
  }
  if (text === "Director deny command approval.") {
    return scenario(
      [
        "read_activity",
        { kind: "resolve_approval", secret: false },
        "read_activity",
        { kind: "finish_if_approval_resolved" },
      ],
      "Denied the command approval.",
    );
  }
  if (text === "Director resolve folder.") {
    return scenario(
      [
        "read_activity",
        "list_workspaces",
        "resolve_resource_request",
        "read_activity",
        { kind: "finish_if_resource_resolved" },
      ],
      "Attached the folder to the selected workstream.",
    );
  }
  if (text === "Director rename selected.") {
    return scenario(
      ["list_workstreams", "rename_selected", "list_workstreams", { kind: "finish_if_renamed" }],
      "Renamed the selected workstream.",
    );
  }
  if (text === "Director archive selected.") {
    return scenario(
      ["list_workstreams", "archive_selected", "list_workstreams", { kind: "finish_if_archived" }],
      "Archived the selected workstream.",
    );
  }
  if (text === "Director select root.") {
    return scenario(
      ["list_workstreams", { kind: "select_title", title: "Director root" }],
      "Selected the Director root.",
    );
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
  if (step === "list_workspaces" || step === "list_workstreams" || step === "read_activity") {
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
  if (step === "cancel_selected") {
    return {
      arguments: { workstreamId: requiredSelectedWorkstream(receipts).workstreamId },
      tool: "cancel_run",
    };
  }
  if (step === "rename_selected") {
    return {
      arguments: {
        title: "Resolved draft",
        workstreamId: requiredSelectedWorkstream(receipts).workstreamId,
      },
      tool: "rename_workstream",
    };
  }
  if (step === "archive_selected") {
    return {
      arguments: { workstreamId: requiredSelectedWorkstream(receipts).workstreamId },
      tool: "archive_workstream",
    };
  }
  if (step === "resolve_resource_request") {
    return {
      arguments: {
        requestId: requiredResourceRequest(receipts).requestId,
        workspaceId: requiredWorkspace(receipts).workspaceId,
      },
      tool: "resolve_resource_request",
    };
  }
  if (step?.kind === "resolve_approval") {
    const approval = requiredApproval(receipts, step.secret);
    const question = approval.questions?.[0];
    return {
      arguments: {
        answers: step.secret
          ? [{ answers: ["invented-secret"], questionId: question?.questionId }]
          : null,
        approvalId: approval.approvalId,
        decision: step.secret ? "answered" : "denied",
      },
      succeeds: step.succeeds,
      tool: "resolve_approval",
    };
  }
  if (step?.kind === "select_title") {
    const workstream = requiredWorkstreamWithTitle(receipts, step.title);
    return {
      arguments: { workstreamId: workstream.workstreamId },
      tool: "select_workstream",
    };
  }
  if (step?.kind === "finish_if_cancelled") {
    const cancelled = requiredReceipt(receipts, "cancel_run");
    const listing = latestReceipt(receipts, "list_workstreams");
    const workstream = listing.workstreams?.find(
      (candidate) => candidate.workstreamId === cancelled.workstreamId,
    );
    if (!workstream || workstream.hasActiveRun !== false) {
      throw new Error("Director cancel_run was not visible to the next tool call");
    }
    return null;
  }
  if (step?.kind === "finish_if_approval_resolved") {
    const approval = requiredApproval(receipts, false);
    const activity = latestReceipt(receipts, "read_activity");
    if (activity.approvals?.some((candidate) => candidate.approvalId === approval.approvalId)) {
      throw new Error("Director resolve_approval was not visible to the next tool call");
    }
    return null;
  }
  if (step?.kind === "finish_if_resource_resolved") {
    const request = requiredResourceRequest(receipts);
    const activity = latestReceipt(receipts, "read_activity");
    if (activity.resourceRequests?.some((candidate) => candidate.requestId === request.requestId)) {
      throw new Error("Director resolve_resource_request was not visible to the next tool call");
    }
    return null;
  }
  if (step?.kind === "finish_if_renamed") {
    requiredWorkstreamWithTitle(receipts, "Resolved draft");
    return null;
  }
  if (step?.kind === "finish_if_archived") {
    const archived = requiredReceipt(receipts, "archive_workstream");
    const listing = latestReceipt(receipts, "list_workstreams");
    if (
      listing.workstreams?.some((candidate) => candidate.workstreamId === archived.workstreamId)
    ) {
      throw new Error("Director archive_workstream was not visible to the next tool call");
    }
    return null;
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

export function decodeDirectorToolReceipt(
  requestId,
  expectedTool,
  message,
  expectedSucceeded = true,
) {
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
  const refused =
    receipt?.summary?.startsWith("Setta refused") ||
    receipt?.summary?.startsWith("Setta could not");
  if (
    receipt?.tool !== expectedTool ||
    !nonEmptyString(receipt.summary) ||
    (expectedSucceeded && refused) ||
    (!expectedSucceeded && !refused)
  ) {
    throw new Error(`Director tool ${requestId} receipt drifted: ${JSON.stringify(receipt)}`);
  }
  if (expectedSucceeded) {
    validateDirectorToolReceipt(expectedTool, receipt);
  }
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
    case "read_activity":
      if (!receipt.aggregates || !Array.isArray(receipt.workstreams)) {
        throw new Error("Director read_activity returned an incomplete activity report");
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
    case "archive_workstream":
    case "cancel_run":
    case "rename_workstream":
    case "resolve_approval":
    case "resolve_resource_request":
    case "steer_work":
    case "submit_work":
      if (!nonEmptyString(receipt.workstreamId)) {
        throw new Error(`Director ${tool} receipt names no workstream`);
      }
      return;
    case "select_workstream":
      if (
        !nonEmptyString(receipt.workstreamId) ||
        receipt.selectedWorkstreamId !== receipt.workstreamId
      ) {
        throw new Error("Director select_workstream did not select its workstream");
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

function requiredWorkstreamWithTitle(receipts, title) {
  const listing = [...receipts].reverse().find((receipt) => Array.isArray(receipt.workstreams));
  const workstream = listing?.workstreams?.find((candidate) => candidate.title === title);
  if (!nonEmptyString(workstream?.workstreamId)) {
    throw new Error(`Director scenario received no workstream titled ${JSON.stringify(title)}`);
  }
  return workstream;
}

function requiredApproval(receipts, secret) {
  const activity = [...receipts]
    .reverse()
    .find((receipt) => receipt.approvals?.some((approval) => approval.secret === secret));
  const approval = activity?.approvals?.find((candidate) => candidate.secret === secret);
  if (
    !nonEmptyString(approval?.approvalId) ||
    !nonEmptyString(approval?.workstreamId) ||
    !Array.isArray(approval?.questions)
  ) {
    throw new Error(`Director scenario received no ${secret ? "secret" : "public"} approval`);
  }
  return approval;
}

function requiredResourceRequest(receipts) {
  const activity = [...receipts].reverse().find((receipt) => receipt.resourceRequests?.length > 0);
  const request = activity?.resourceRequests?.[0];
  if (!nonEmptyString(request?.requestId) || !nonEmptyString(request?.workstreamId)) {
    throw new Error("Director scenario received no open resource request");
  }
  return request;
}

function requiredReceipt(receipts, tool) {
  const receipt = receipts.find((candidate) => candidate.tool === tool);
  if (!receipt) {
    throw new Error(`Director scenario received no ${tool} receipt`);
  }
  return receipt;
}

function latestReceipt(receipts, tool) {
  const receipt = [...receipts].reverse().find((candidate) => candidate.tool === tool);
  if (!receipt) {
    throw new Error(`Director scenario received no latest ${tool} receipt`);
  }
  return receipt;
}

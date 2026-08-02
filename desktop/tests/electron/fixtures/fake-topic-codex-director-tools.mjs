import { nonEmptyString } from "./fake-topic-codex-app-server-helpers.mjs";

const directorToolNames = [
  "archive_workstream",
  "ask_conversation",
  "cancel_run",
  "create_workstream",
  "fork_workstream",
  "list_workspaces",
  "list_workstreams",
  "read_activity",
  "recover_run",
  "rename_workstream",
  "request_user_choice",
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
  [
    "Director artifact.",
    { input: "director artifact", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  [
    "Director mixed artifact.",
    { input: "supplied mixed document", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  // Native artifact work declares nothing about the user's files, so every
  // unbound delivery below is `optional` and must run without a folder.
  [
    "Director unbound dataset.",
    {
      input: "supplied language-counts dataset",
      tool: "submit_work",
      workspaceRequirement: "optional",
    },
  ],
  [
    "Director unbound notes.",
    {
      input: "supplied qualitative release notes",
      tool: "submit_work",
      workspaceRequirement: "optional",
    },
  ],
  [
    "Director unbound saved image.",
    { input: "unbound artifact", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  [
    "Director unbound file reference.",
    {
      input: "supplied private directory reference",
      tool: "submit_work",
      workspaceRequirement: "optional",
    },
  ],
  [
    "Director unbound hold.",
    { input: "unbound hold", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  [
    "Director unbound queue.",
    { input: "unbound queued", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  ["Director unbound steer.", { input: "finish unbound hold", tool: "steer_work" }],
  [
    "Director unbound cancel hold.",
    { input: "unbound hold cancel", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  [
    "Director unbound fail.",
    { input: "director fail", tool: "submit_work", workspaceRequirement: "optional" },
  ],
  [
    "Director bound dataset.",
    {
      input: "supplied language-counts dataset",
      tool: "submit_work",
      workspaceRequirement: "optional",
    },
  ],
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

// Every Director turn whose scripted answer depends only on its exact text.
// Keeping them as data rather than a branch per phrase is what lets a new
// scenario be one entry instead of one more path through the dispatcher.
const staticDirectorScenarios = new Map([
  ["Director normal conversation.", { reply: "The Director can answer without acting." }],
  [
    "Director delayed conversation.",
    { delayMs: 600, reply: "The Director finished the delayed answer." },
  ],
  [
    "Remember DIRECTOR_HISTORY_OK and acknowledge it.",
    { reply: "I will remember DIRECTOR_HISTORY_OK." },
  ],
  [
    "Director create workspace workstream.",
    {
      reply: "I created and selected the workstream.",
      review: {
        delayMs: 0,
        reply: "Created and selected Director root.",
        review: null,
        steps: ["list_workspaces", "create_workspace"],
      },
    },
  ],
  [
    "Director create folderless.",
    { reply: "Created the folderless Director root.", steps: ["create_folderless"] },
  ],
  [
    "Director create unbound.",
    { reply: "Started the unbound artifact work.", steps: ["create_unbound"] },
  ],
  [
    "Director create bound.",
    { reply: "Created the workspace-bound work.", steps: ["list_workspaces", "create_bound"] },
  ],
  [
    "Director create file dependent.",
    { reply: "The file work needs a folder first.", steps: ["create_file_dependent"] },
  ],
  [
    "Director select unbound.",
    {
      reply: "Selected the unbound artifact work.",
      steps: ["list_workstreams", { kind: "select_title", title: "Unbound artifacts" }],
    },
  ],
  [
    "Director select bound.",
    {
      reply: "Selected the workspace-bound work.",
      steps: ["list_workstreams", { kind: "select_title", title: "Bound artifacts" }],
    },
  ],
  [
    "Director recover.",
    { reply: "Recovered the failed Director run.", steps: ["list_workstreams", "recover_run"] },
  ],
  [
    "Director cancel.",
    {
      reply: "Cancelled the selected Director run.",
      steps: [
        "list_workstreams",
        "cancel_selected",
        "list_workstreams",
        { kind: "finish_if_cancelled" },
      ],
    },
  ],
  [
    "Director try secret approval.",
    {
      reply: "The secret approval is waiting for the user.",
      steps: ["read_activity", { kind: "resolve_approval", secret: true, succeeds: false }],
    },
  ],
  [
    "Director deny command approval.",
    {
      reply: "Denied the command approval.",
      steps: [
        "read_activity",
        { kind: "resolve_approval", secret: false },
        "read_activity",
        { kind: "finish_if_approval_resolved" },
      ],
    },
  ],
  [
    "Director resolve folder.",
    {
      reply: "Attached the folder to the selected workstream.",
      steps: [
        "read_activity",
        "list_workspaces",
        "resolve_resource_request",
        "read_activity",
        { kind: "finish_if_resource_resolved" },
      ],
    },
  ],
  [
    "Director rename selected.",
    {
      reply: "Renamed the selected workstream.",
      steps: [
        "list_workstreams",
        "rename_selected",
        "list_workstreams",
        { kind: "finish_if_renamed" },
      ],
    },
  ],
  [
    "Director archive selected.",
    {
      reply: "Archived the selected workstream.",
      steps: [
        "list_workstreams",
        "archive_selected",
        "list_workstreams",
        { kind: "finish_if_archived" },
      ],
    },
  ],
  [
    "Director fork selected.",
    {
      reply: "Forked the selected workstream.",
      steps: [
        "list_workstreams",
        "fork_selected",
        "list_workstreams",
        { kind: "finish_if_forked" },
      ],
    },
  ],
  [
    "Director select root.",
    {
      reply: "Selected the Director root.",
      steps: ["list_workstreams", { kind: "select_title", title: "Director root" }],
    },
  ],
]);

export function directorScenarioForTurn(text, injectedItems = []) {
  if (text.startsWith("local transcript for ")) {
    return scenario([], "The Director received the voice request.");
  }
  if (text === "What marker did I ask you to remember?") {
    return rememberedMarkerScenario(injectedItems);
  }
  const staticScenario = staticDirectorScenarios.get(text);
  if (staticScenario) {
    return scenario(
      staticScenario.steps ?? [],
      staticScenario.reply,
      staticScenario.delayMs ?? 0,
      staticScenario.review ?? null,
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

function rememberedMarkerScenario(injectedItems) {
  const history = JSON.stringify(injectedItems);
  return history.includes("Remember DIRECTOR_HISTORY_OK") &&
    history.includes("I will remember DIRECTOR_HISTORY_OK.")
    ? scenario([], "DIRECTOR_HISTORY_OK")
    : null;
}

function scenario(steps, reply, delayMs = 0, review = null) {
  return { delayMs, reply, review, steps };
}

// One scripted workstream creation per named step. Each entry is the exact
// `create_workstream` call the fake Director makes, so what a scenario declares
// about the user's files stays visible beside the folder it names.
const workstreamCreationSteps = new Map([
  [
    "create_workspace",
    (receipts) => ({
      initialInput: null,
      title: "Director root",
      workspaceId: requiredWorkspace(receipts).workspaceId,
      workspaceRequirement: "required",
    }),
  ],
  [
    "create_folderless",
    () => ({
      initialInput: "director folderless first work",
      title: "Director root",
      workspaceId: null,
      workspaceRequirement: "required",
    }),
  ],
  [
    "create_unbound",
    () => ({
      initialInput: "supplied language-counts dataset",
      title: "Unbound artifacts",
      workspaceId: null,
      workspaceRequirement: "optional",
    }),
  ],
  [
    "create_bound",
    (receipts) => ({
      initialInput: null,
      title: "Bound artifacts",
      workspaceId: requiredWorkspace(receipts).workspaceId,
      workspaceRequirement: "optional",
    }),
  ],
  [
    "create_file_dependent",
    () => ({
      initialInput: "read the user's project files",
      title: "File dependent work",
      workspaceId: null,
      workspaceRequirement: "required",
    }),
  ],
]);

const namedToolCallSteps = new Map([
  ["list_workspaces", () => ({ arguments: {}, tool: "list_workspaces" })],
  ["list_workstreams", () => ({ arguments: {}, tool: "list_workstreams" })],
  ["read_activity", () => ({ arguments: {}, tool: "read_activity" })],
  ["recover_run", recoverRunCall],
  [
    "cancel_selected",
    (receipts) => ({
      arguments: { workstreamId: requiredSelectedWorkstream(receipts).workstreamId },
      tool: "cancel_run",
    }),
  ],
  [
    "rename_selected",
    (receipts) => ({
      arguments: {
        title: "Resolved draft",
        workstreamId: requiredSelectedWorkstream(receipts).workstreamId,
      },
      tool: "rename_workstream",
    }),
  ],
  // Forking names only the workstream and the title. Where the branch is cut is
  // the parent's latest completed run, which trusted state resolves, so a fake
  // Director that tried to name it would be asserting authority it does not
  // have.
  [
    "fork_selected",
    (receipts) => ({
      arguments: {
        title: "Director branch",
        workstreamId: requiredSelectedWorkstream(receipts).workstreamId,
      },
      tool: "fork_workstream",
    }),
  ],
  [
    "archive_selected",
    (receipts) => ({
      arguments: { workstreamId: requiredSelectedWorkstream(receipts).workstreamId },
      tool: "archive_workstream",
    }),
  ],
  [
    "resolve_resource_request",
    (receipts) => ({
      arguments: {
        requestId: requiredResourceRequest(receipts).requestId,
        workspaceId: requiredWorkspace(receipts).workspaceId,
      },
      tool: "resolve_resource_request",
    }),
  ],
]);

const keyedToolCallSteps = new Map([
  ["resolve_approval", resolveApprovalCall],
  ["select_title", selectTitleCall],
  ["selected_work", selectedWorkCall],
  ["finish_if_cancelled", finishIfCancelled],
  ["finish_if_approval_resolved", finishIfApprovalResolved],
  ["finish_if_resource_resolved", finishIfResourceResolved],
  ["finish_if_renamed", finishIfRenamed],
  ["finish_if_archived", finishIfArchived],
  ["finish_if_forked", finishIfForked],
]);

export function directorToolCallForStep(scenarioValue, index, receipts) {
  const step = scenarioValue?.steps?.[index];
  if (step === undefined) {
    return null;
  }
  if (typeof step === "string") {
    const creation = workstreamCreationSteps.get(step);
    if (creation) {
      return { arguments: creation(receipts), tool: "create_workstream" };
    }
    const named = namedToolCallSteps.get(step);
    if (named) {
      return named(receipts);
    }
  }
  const keyed = keyedToolCallSteps.get(step?.kind);
  if (!keyed) {
    throw new Error(`unsupported Director tool scenario step ${JSON.stringify(step)}`);
  }
  return keyed(step, receipts);
}

function recoverRunCall(receipts) {
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

function resolveApprovalCall(step, receipts) {
  const approval = requiredApproval(receipts, step.secret);
  return {
    arguments: {
      approvalId: approval.approvalId,
      decision: step.secret ? "answered" : "denied",
    },
    succeeds: step.succeeds,
    tool: "resolve_approval",
  };
}

function selectTitleCall(step, receipts) {
  return {
    arguments: { workstreamId: requiredWorkstreamWithTitle(receipts, step.title).workstreamId },
    tool: "select_workstream",
  };
}

function selectedWorkCall(step, receipts) {
  const workArguments = {
    input: step.input,
    workstreamId: requiredSelectedWorkstream(receipts).workstreamId,
  };
  // Steering changes a run already carrying work, so only a delivery declares
  // what the work needs from the user's files.
  if (step.tool === "submit_work") {
    workArguments.workspaceRequirement = step.workspaceRequirement ?? "required";
  }
  return { arguments: workArguments, tool: step.tool };
}

function finishIfCancelled(step, receipts) {
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

function finishIfApprovalResolved(step, receipts) {
  const approval = requiredApproval(receipts, false);
  const activity = latestReceipt(receipts, "read_activity");
  if (activity.approvals?.some((candidate) => candidate.approvalId === approval.approvalId)) {
    throw new Error("Director resolve_approval was not visible to the next tool call");
  }
  return null;
}

function finishIfResourceResolved(step, receipts) {
  const request = requiredResourceRequest(receipts);
  const activity = latestReceipt(receipts, "read_activity");
  if (activity.resourceRequests?.some((candidate) => candidate.requestId === request.requestId)) {
    throw new Error("Director resolve_resource_request was not visible to the next tool call");
  }
  return null;
}

function finishIfRenamed(step, receipts) {
  requiredWorkstreamWithTitle(receipts, "Resolved draft");
  return null;
}

// finishIfForked proves the branch is a workstream in its own right by the time
// the next tool call runs: a new id, selected, and listed beside the parent it
// came from rather than replacing it.
function finishIfForked(step, receipts) {
  const forked = requiredReceipt(receipts, "fork_workstream");
  const listing = latestReceipt(receipts, "list_workstreams");
  const branch = listing.workstreams?.find(
    (candidate) => candidate.workstreamId === forked.workstreamId,
  );
  if (!branch || branch.title !== "Director branch" || !branch.selected) {
    throw new Error("Director fork_workstream did not produce a selected branch workstream");
  }
  return null;
}

function finishIfArchived(step, receipts) {
  const archived = requiredReceipt(receipts, "archive_workstream");
  const listing = latestReceipt(receipts, "list_workstreams");
  if (listing.workstreams?.some((candidate) => candidate.workstreamId === archived.workstreamId)) {
    throw new Error("Director archive_workstream was not visible to the next tool call");
  }
  return null;
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
  const receipt = JSON.parse(directorToolReceiptText(requestId, message.result));
  if (
    receipt?.tool !== expectedTool ||
    !nonEmptyString(receipt.summary) ||
    directorToolReceiptWasRefused(receipt) !== !expectedSucceeded
  ) {
    throw new Error(`Director tool ${requestId} receipt drifted: ${JSON.stringify(receipt)}`);
  }
  if (expectedSucceeded) {
    validateDirectorToolReceipt(expectedTool, receipt);
  }
  return receipt;
}

function directorToolReceiptText(requestId, result) {
  const item = Array.isArray(result?.contentItems) ? result.contentItems[0] : null;
  const valid = [
    result?.success === true,
    result?.contentItems?.length === 1,
    item?.type === "inputText",
    nonEmptyString(item?.text),
  ].every(Boolean);
  if (!valid) {
    throw new Error(`Director tool ${requestId} returned a malformed result`);
  }
  return item.text;
}

function directorToolReceiptWasRefused(receipt) {
  const summary = receipt?.summary ?? "";
  return summary.startsWith("Setta refused") || summary.startsWith("Setta could not");
}

// One validator per Setta tool receipt. The Director's receipt is the only
// thing the fake model sees, so each entry states what that tool must have
// reported back before the next scripted step may rely on it.
const directorReceiptValidators = new Map([
  [
    "list_workspaces",
    (receipt) =>
      Array.isArray(receipt.workspaces) && receipt.workspaces.length > 0
        ? null
        : "Director list_workspaces returned no authorized workspace",
  ],
  [
    "list_workstreams",
    (receipt) =>
      Array.isArray(receipt.workstreams) && receipt.workstreams.length > 0
        ? null
        : "Director list_workstreams returned no workstream",
  ],
  [
    "read_activity",
    (receipt) =>
      receipt.aggregates && Array.isArray(receipt.workstreams)
        ? null
        : "Director read_activity returned an incomplete activity report",
  ],
  [
    "create_workstream",
    (receipt) =>
      directorReceiptSelectedItsWorkstream(receipt)
        ? null
        : "Director create_workstream did not create and select one workstream",
  ],
  // Forking reports the branch it made, not the workstream it branched: the
  // parent is where the call was aimed, but the new workstream is what the
  // Director now has to talk about.
  [
    "fork_workstream",
    (receipt) =>
      directorReceiptSelectedItsWorkstream(receipt)
        ? null
        : "Director fork_workstream did not create and select one branch workstream",
  ],
  [
    "select_workstream",
    (receipt) =>
      directorReceiptSelectedItsWorkstream(receipt)
        ? null
        : "Director select_workstream did not select its workstream",
  ],
  ...[
    "archive_workstream",
    "cancel_run",
    "recover_run",
    "rename_workstream",
    "resolve_approval",
    "resolve_resource_request",
    "steer_work",
    "submit_work",
  ].map((tool) => [
    tool,
    (receipt) =>
      nonEmptyString(receipt.workstreamId) ? null : `Director ${tool} receipt names no workstream`,
  ]),
]);

function validateDirectorToolReceipt(tool, receipt) {
  const validate = directorReceiptValidators.get(tool);
  if (!validate) {
    throw new Error(`unexpected Director tool receipt ${tool}`);
  }
  const failure = validate(receipt);
  if (failure !== null) {
    throw new Error(failure);
  }
}

function directorReceiptSelectedItsWorkstream(receipt) {
  return (
    nonEmptyString(receipt.workstreamId) && receipt.selectedWorkstreamId === receipt.workstreamId
  );
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
  if (!answerableApproval(approval)) {
    throw new Error(`Director scenario received no ${secret ? "secret" : "public"} approval`);
  }
  return approval;
}

function answerableApproval(approval) {
  return [
    nonEmptyString(approval?.approvalId),
    nonEmptyString(approval?.workstreamId),
    Array.isArray(approval?.questions),
  ].every(Boolean);
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

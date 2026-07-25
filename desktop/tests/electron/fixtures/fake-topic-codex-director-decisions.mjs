import { nonEmptyString } from "./fake-topic-codex-app-server-helpers.mjs";

export function scriptedDirectorDecision(context, outputSchema) {
  if (!validDirectorDecisionContext(context, outputSchema)) {
    return null;
  }
  const text = context.intent?.text;
  const selected = context.workstreams?.find(
    (target) => target.workstreamId === context.selectedWorkstreamId,
  );
  for (const resolve of directorDecisionResolvers) {
    const decision = resolve(text, context, selected);
    if (decision !== undefined) {
      return decision;
    }
  }
  return null;
}

function validDirectorDecisionContext(context, outputSchema) {
  return (
    Array.isArray(context.allowedDecisionKinds) &&
    !JSON.stringify(context).includes('"rootPath"') &&
    JSON.stringify(outputSchema).includes('"decision"')
  );
}

const directorDecisionResolvers = [
  resolveDirectorRepairDecision,
  resolveDirectorFolderlessDecision,
  resolveDirectorVoiceDecision,
  resolveDirectorChildDecision,
  resolveDirectorWorkDecision,
  resolveDirectorRecoveryDecision,
];

function resolveDirectorRepairDecision(text, context) {
  if (text !== "Director repair malformed.") {
    return undefined;
  }
  if (context.validationDiagnostic === null) {
    return { kind: "not_a_director_decision" };
  }
  return context.validationDiagnostic && context.allowedDecisionKinds.includes("answer_directly")
    ? { kind: "answer_directly", text: "The malformed decision was repaired." }
    : null;
}

function resolveDirectorFolderlessDecision(text, context) {
  if (text !== "Director create folderless.") {
    return undefined;
  }
  return context.allowedDecisionKinds.includes("create_workstream")
    ? {
        initialInput: "director folderless first work",
        kind: "create_workstream",
        origin: {
          kind: "root",
          root: { resourceScope: { kind: "folderless" } },
        },
        proposedTitle: "Director root",
      }
    : null;
}

function resolveDirectorVoiceDecision(text, context) {
  if (!text?.startsWith("local transcript for ")) {
    return undefined;
  }
  return context.allowedDecisionKinds.includes("answer_directly")
    ? { kind: "answer_directly", text: "The Director received the voice request." }
    : null;
}

function resolveDirectorChildDecision(text, context, selected) {
  if (text !== "Director create child.") {
    return undefined;
  }
  return selected?.allowsChildWorkstream &&
    context.allowedDecisionKinds.includes("create_workstream")
    ? {
        initialInput: "director child work",
        kind: "create_workstream",
        origin: {
          child: { parentWorkstreamId: selected.workstreamId },
          kind: "child",
        },
        proposedTitle: "Director child",
      }
    : null;
}

const directorWorkDecisions = new Map([
  ["Director send hold.", ["send_to_workstream", "director hold"]],
  ["Director queue next.", ["queue_behind_run", "director queued"]],
  ["Director steer now.", ["steer_run", "finish director hold"]],
  ["Director send cancel hold.", ["send_to_workstream", "director hold cancel"]],
  ["Director request approval.", ["send_to_workstream", "director approval"]],
  ["Director fail.", ["send_to_workstream", "director fail"]],
  ["Director artifact.", ["send_to_workstream", "director artifact"]],
  ["Director graph burst.", ["send_to_workstream", "director graph burst"]],
  [
    "Director text burst.",
    ["send_to_workstream", "Profile exactly 2000 conversation events for workstream 1."],
  ],
  ["Director sustained.", ["send_to_workstream", "director sustained profile"]],
]);

function resolveDirectorWorkDecision(text, _context, selected) {
  const workDecision = directorWorkDecisions.get(text);
  if (!workDecision) {
    return undefined;
  }
  const [kind, authoredInput] = workDecision;
  return selected?.allowedDecisionKinds?.includes(kind)
    ? { authoredInput, kind, workstreamId: selected.workstreamId }
    : null;
}

function resolveDirectorRecoveryDecision(text, _context, selected) {
  if (text !== "Director recover.") {
    return undefined;
  }
  const failure = selected?.recoverableFailures?.[0];
  return selected?.allowedDecisionKinds?.includes("recover_path") &&
    nonEmptyString(failure?.failureEventId)
    ? {
        failureEventId: failure.failureEventId,
        kind: "recover_path",
        workstreamId: selected.workstreamId,
      }
    : null;
}

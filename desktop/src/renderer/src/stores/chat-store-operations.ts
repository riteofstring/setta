export type ChatOperation =
  | "approving"
  | "cancelling"
  | "creating"
  | "deleting"
  | "editingQueued"
  | "commanding"
  | "loading"
  | "loadingOlder"
  | "queueing"
  | "removingQueued"
  | "refreshing"
  | "sending"
  | "sendingSteeringImmediately"
  | "steering"
  | null;

export type ChatOperationScope =
  | "approvalMutation"
  | "commandMutation"
  | "conversation"
  | "eventResync"
  | "messageMutation"
  | "pagination"
  | "queueMutation"
  | "runMutation";

export interface ChatOperationToken {
  id: number;
  scope: ChatOperationScope;
}

const chatOperationScopes = [
  "approvalMutation",
  "commandMutation",
  "conversation",
  "eventResync",
  "messageMutation",
  "pagination",
  "queueMutation",
  "runMutation",
] as const satisfies readonly ChatOperationScope[];

const visibleOperationPriority = [
  "approvalMutation",
  "queueMutation",
  "messageMutation",
  "runMutation",
  "commandMutation",
  "conversation",
  "pagination",
  "eventResync",
] as const satisfies readonly ChatOperationScope[];

export const conversationBoundOperationScopes = chatOperationScopes.filter(
  (scope) => scope !== "conversation",
);

export function createChatOperationTracker() {
  let operationSequence = 0;
  const currentOperationIds = operationScopeRecord(0);
  const activeOperationByScope = operationScopeRecord<ChatOperation>(null);

  function begin(
    scope: ChatOperationScope,
    cancelScopes: ChatOperationScope[] = [],
  ): ChatOperationToken {
    operationSequence += 1;
    const token = { id: operationSequence, scope };
    for (const cancelledScope of cancelScopes) {
      currentOperationIds[cancelledScope] = 0;
      activeOperationByScope[cancelledScope] = null;
    }
    currentOperationIds[scope] = token.id;
    return token;
  }

  function beginPatch<Patch extends { operation?: ChatOperation }>(
    scope: ChatOperationScope,
    patch: Patch,
  ): Patch {
    if (!patchHasOperation(patch)) {
      return patch;
    }
    activeOperationByScope[scope] = patch.operation ?? null;
    return { ...patch, operation: visibleOperation() };
  }

  function completePatch<Patch extends { operation?: ChatOperation }>(
    token: ChatOperationToken,
    patch: Patch,
  ): Patch | null {
    if (!isCurrent(token)) {
      return null;
    }
    currentOperationIds[token.scope] = 0;
    activeOperationByScope[token.scope] = patchHasOperation(patch)
      ? (patch.operation ?? null)
      : null;
    return { ...patch, operation: visibleOperation() };
  }

  function isCurrent(token: ChatOperationToken) {
    return currentOperationIds[token.scope] === token.id;
  }

  function cancelScopes<Patch extends { operation?: ChatOperation }>(
    scopes: ChatOperationScope[],
    patch: Patch,
  ): Patch {
    for (const scope of scopes) {
      currentOperationIds[scope] = 0;
      activeOperationByScope[scope] = null;
    }
    return { ...patch, operation: visibleOperation() };
  }

  function visibleOperation() {
    for (const scope of visibleOperationPriority) {
      const operation = activeOperationByScope[scope];
      if (operation !== null) {
        return operation;
      }
    }
    return null;
  }

  return {
    begin,
    beginPatch,
    cancelScopes,
    completePatch,
    isCurrent,
  };
}

function operationScopeRecord<Value>(value: Value): Record<ChatOperationScope, Value> {
  return Object.fromEntries(chatOperationScopes.map((scope) => [scope, value])) as Record<
    ChatOperationScope,
    Value
  >;
}

function patchHasOperation(patch: { operation?: ChatOperation }) {
  return Object.prototype.hasOwnProperty.call(patch, "operation");
}

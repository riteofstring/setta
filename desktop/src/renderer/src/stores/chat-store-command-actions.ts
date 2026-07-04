import type { ChatCommandExecuteResult } from "@generated/backend";

import { errorPatch } from "./chat-store-helpers";
import { commandOperationPatch } from "./chat-store-page-patches";
import type { ChatOperationToken } from "./chat-store-operations";
import type { ChatCommandClientOptions, ChatPatch, ChatStore } from "./chat-store-types";

interface CommandMutationRunnerContext {
  beginOperation: (scope: "commandMutation", patch: ChatPatch) => ChatOperationToken;
  commitCurrent: (token: ChatOperationToken, patch: ChatPatch) => void;
  commitCurrentFromState: (
    token: ChatOperationToken,
    patchForState: (state: ChatStore) => ChatPatch,
  ) => void;
  get: () => ChatStore;
}

export function createCommandMutationRunner({
  beginOperation,
  commitCurrent,
  commitCurrentFromState,
  get,
}: CommandMutationRunnerContext) {
  return async function runCommandMutation(
    request: (workspaceId: string, conversationId: string) => Promise<ChatCommandExecuteResult>,
    clientOptions: ChatCommandClientOptions = {},
  ) {
    const { activeRun, selectedConversation, workspaceId } = get();
    if (!workspaceId || !selectedConversation) {
      throw new Error("No chat is selected");
    }
    const operation = beginOperation(
      "commandMutation",
      commandMutationBeginPatch(selectedConversation.id, clientOptions),
    );
    try {
      const result = await request(workspaceId, selectedConversation.id);
      commitCurrentFromState(operation, (current) => ({
        ...commandOperationPatch(current, result, activeRun),
        operation: null,
        pendingGoalSubmission: null,
        selectedConversation: result.conversation,
        status: "ready",
      }));
      return result;
    } catch (error) {
      commitCurrent(operation, { ...errorPatch(error), pendingGoalSubmission: null });
      throw error;
    }
  };
}

function commandMutationBeginPatch(
  conversationId: string,
  clientOptions: ChatCommandClientOptions,
): ChatPatch {
  const objective = clientOptions.pendingGoalObjective?.trim();
  return {
    error: null,
    operation: "commanding",
    pendingGoalSubmission: objective ? { conversationId, objective } : null,
  };
}
